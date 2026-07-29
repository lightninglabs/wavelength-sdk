import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useWallet,
  useWalletActivity,
  useWalletBalance,
} from '@lightninglabs/wavelength-react';
import type { WalletKind } from '@lightninglabs/wavelength-react';
import { getDefaultDataDir } from '@lightninglabs/wavelength-react-native';
import { AppShell } from './components/layout/AppShell';
import { RecoveryBanner } from './components/RecoveryBanner';
import { ExitBanner } from './components/ExitBanner';
import { AppTab } from './components/layout/nav';
import { balanceSat } from './lib/balance';
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from './lib/usePollWhileWaiting';
import {
  addWallet,
  newWalletEntry,
  removeWallet,
  runtimeConfigForEntry,
  updateWallet,
  WalletEntry,
} from './lib/walletRegistry';
import { useWalletRegistry } from './lib/useWalletRegistry';
import { RuntimeNetwork, WalletEndpoints } from './lib/runtime-config';
import { wipeLocalData } from './lib/wipeLocalData';
import { ActivityScreen } from './screens/activity/ActivityScreen';
import { HomeScreen } from './screens/home/HomeScreen';
import { BackupScreen } from './screens/onboarding/BackupScreen';
import { ChooseNetworkScreen } from './screens/onboarding/ChooseNetworkScreen';
import { DataMissingScreen } from './screens/onboarding/DataMissingScreen';
import { ErrorScreen } from './screens/onboarding/ErrorScreen';
import { LoadingScreen } from './screens/onboarding/LoadingScreen';
import { OnboardingFlow } from './screens/onboarding/OnboardingFlow';
import { StoppedScreen } from './screens/onboarding/StoppedScreen';
import { SyncingScreen } from './screens/onboarding/SyncingScreen';
import { UnlockScreen } from './screens/onboarding/UnlockScreen';
import { WalletListScreen } from './screens/onboarding/WalletListScreen';
import { WalletSetupScreen } from './screens/onboarding/WalletSetupScreen';
import { ReceiveScreen } from './screens/receive/ReceiveScreen';
import { SendScreen } from './screens/send/SendScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { ExitScreen } from './screens/exit/ExitScreen';

// The legacy single-wallet era's fixed AsyncStorage keys. wipeAll removes
// these alongside the registry itself so a clean device state does not leave
// a stale marker for the next migration to pick back up.
const LEGACY_KIND_KEY = 'wavelength.walletKind';
const LEGACY_CREDENTIAL_KEY = 'wavelength.passkeyCredentialId';
const WALLETS_KEY = 'wavelength.wallets';

// WalletApp is the wallet orchestrator: it owns cross-screen session state
// (which registry entry is selected, the pre-start sub-screen shown while no
// wallet is running, recovery-phrase backup gating, the active tab) and
// routes to the correct screen by runtime phase. The registry
// (lib/walletRegistry) is the source of truth for which wallets exist; the
// engine itself only ever knows about the one entry currently started. The
// engine is owned by App.tsx (the app root) and reached through the granular
// provider hooks; each screen self-serves the wallet data, verbs and passkey
// ceremony it needs, so WalletApp only wires up what stays cross-cutting:
// registry selection, the pre-start routing, backup gating and the phase
// routing switch itself.
export function WalletApp() {
  const { phase, error, start, stop } = useWallet();
  // Kept only to drive the app-wide "poll while a boarding deposit or
  // exit/leave is pending" behavior below; never passed to a screen. Each
  // screen that displays balance or activity self-serves those hooks.
  const balance = useWalletBalance();
  const activity = useWalletActivity();

  // Track pending on-chain activity to completion. Boarding deposits and
  // exits/leaves are not pushed on the activity stream, so without this a
  // pending row would sit stale until a manual refresh. Lightning/credit
  // send+receive are stream-backed and excluded. Runs app-wide so it keeps
  // going after the waiting screen unmounts.
  usePollWhileWaiting(hasPendingOnchain(activity, balance));

  const { wallets, refresh } = useWalletRegistry();
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    null,
  );
  // preStart is the sub-screen shown while no wallet is running: the list,
  // the create/restore form, or the legacy network picker for the entry
  // being opened.
  const [preStart, setPreStart] = useState<
    | { kind: 'list' }
    | { kind: 'create' }
    | { kind: 'restore' }
    | { kind: 'chooseNetwork'; entryId: string }
  >({ kind: 'list' });
  // pendingNetwork holds a legacy entry's unpersisted network guess until an
  // unlock proves it right.
  const [pendingNetwork, setPendingNetwork] = useState<
    { network: RuntimeNetwork; endpoints: WalletEndpoints } | null
  >(null);
  const [onboardingMode, setOnboardingMode] = useState<'create' | 'restore'>(
    'create',
  );
  // regtestUnlocked gates the regtest network option and its advanced
  // endpoints section behind a long press, matching the web demo's dev gate.
  const [regtestUnlocked, setRegtestUnlocked] = useState(false);
  const activeEntry =
    (wallets ?? []).find((w) => w.id === selectedWalletId) ?? null;

  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [tab, setTab] = useState<AppTab>('home');
  // setupError surfaces a submitSetup failure (currently only a rejected
  // getDefaultDataDir call, which happens before the runtime is even
  // started) on the create/restore screen; the wallet phase's own `error`
  // never moves for a failure that occurs before start() is called.
  const [setupError, setSetupError] = useState('');

  // A failed start() (or stop()) surfaces on the 'error' phase, so the
  // 'starting'/'stopping' spinner needs no error affordance of its own.
  const runtimeBusy = phase === 'starting' || phase === 'stopping';

  // Derived display network: pendingNetwork (a legacy entry's unproven
  // guess) wins while it is set, then the entry's own recorded network, then
  // a fallback for screens rendered before any wallet is selected.
  const network = pendingNetwork?.network ?? activeEntry?.network ?? 'signet';

  // openWallet starts the runtime for a registry entry. Legacy entries with
  // no recorded network detour through the network picker first. The mode is
  // what onboarding renders in if the daemon reports needsWallet; it
  // defaults to create so an unfinished entry always resumes deterministically
  // instead of in whatever mode a prior session left behind.
  const openingRef = useRef(false);
  const openWallet = useCallback(
    async (
      entry: WalletEntry,
      override?: { network: RuntimeNetwork; endpoints: WalletEndpoints },
      mode: 'create' | 'restore' = 'create',
    ) => {
      if (!entry.network && !override) {
        setSelectedWalletId(entry.id);
        setPreStart({ kind: 'chooseNetwork', entryId: entry.id });

        return;
      }
      // A rapid double-tap on a WalletListScreen row can fire this twice
      // before the phase re-render disables the row, so the second call
      // would race a start() already in flight. Bail out early on a repeat
      // call and clear the guard once the start sequence settles.
      if (openingRef.current) {
        return;
      }
      setSelectedWalletId(entry.id);
      setPendingNetwork(override ?? null);
      setOnboardingMode(mode);
      // Assembled outside the try so a malformed hand-edited entry throws
      // visibly instead of the open click being a silent no-op. The guard is
      // set only after assembly succeeds, so a throw here cannot leave it
      // latched.
      const config = runtimeConfigForEntry(entry, override);
      openingRef.current = true;
      try {
        const startedInfo = await start(config);
        setBackupAcknowledged(Boolean(startedInfo.walletReady));
      } catch {
        // Surfaced via wallet.error (the phase moves to 'error').
      } finally {
        openingRef.current = false;
      }
    },
    [start],
  );

  // submitSetup registers a fresh entry against the device's default data
  // root, then starts the runtime; the daemon reports needsWallet and
  // onboarding renders in the chosen mode. getDefaultDataDir is a native call
  // that can reject (no bridge, filesystem denied); wrapped in a try/catch so
  // a rejection surfaces on the setup screen's error line instead of leaving
  // Continue a dead button with no feedback.
  const submitSetup = useCallback(
    async (
      mode: 'create' | 'restore',
      args: { name: string; network: RuntimeNetwork; endpoints: WalletEndpoints },
    ) => {
      setSetupError('');
      let entry: WalletEntry;
      try {
        const root = await getDefaultDataDir();
        entry = newWalletEntry({ ...args, dataDirRoot: root });
        await addWallet(entry);
      } catch (err) {
        setSetupError(
          err instanceof Error ? err.message : 'Could not set up the wallet.',
        );

        return;
      }
      refresh();
      await openWallet(entry, undefined, mode);
    },
    [openWallet, refresh],
  );

  // backToWallets stops the runtime (if running) and returns to the list.
  const backToWallets = useCallback(async () => {
    try {
      await stop();
    } catch {
      // Surfaced via wallet.error.
    }
    setSelectedWalletId(null);
    setPendingNetwork(null);
    setPreStart({ kind: 'list' });
    setMnemonic([]);
    setBackupAcknowledged(false);
    setTab('home');
  }, [stop]);

  // retryStart re-runs the failed start against the entry that was selected
  // when it failed, keeping the onboarding mode the failed attempt was
  // headed for; with no selection (a stale error from a prior session) it
  // falls back to the wallet list instead.
  const retryStart = useCallback(() => {
    if (activeEntry) {
      void openWallet(activeEntry, pendingNetwork ?? undefined, onboardingMode);
    } else {
      void backToWallets();
    }
  }, [activeEntry, pendingNetwork, onboardingMode, openWallet, backToWallets]);

  // retryLegacyNetwork re-guesses a legacy entry's network after a previous
  // guess found no wallet data on it: the runtime is already started against
  // the wrong network, so it must stop before restarting with the new pick.
  // The selection is kept so the entry stays active throughout.
  const retryLegacyNetwork = useCallback(
    async (chosenNetwork: RuntimeNetwork, endpoints: WalletEndpoints) => {
      if (!activeEntry) {
        return;
      }
      try {
        await stop();
      } catch {
        // Surfaced via wallet.error.
      }
      await openWallet(activeEntry, {
        network: chosenNetwork,
        endpoints,
      });
    },
    [activeEntry, stop, openWallet],
  );

  // removeEntry is the real per-wallet delete: it stops the runtime first if
  // this happens to be the active entry (never true from the list itself,
  // but a plain guard covers every caller), wipes the entry's on-disk data,
  // then drops it from the registry. The wipe failure is swallowed: the
  // directory may not exist yet for an unfinished wallet, and the entry
  // removal must proceed regardless.
  //
  // A legacy migrated entry's dataDir IS the shared default data root (see
  // migrateLegacyEntries in lib/walletRegistry.ts), while every wallet
  // created after the registry existed lives nested inside that root at
  // `${root}/${id}`. expo-file-system's Directory.delete() is recursive, so
  // wiping a legacy entry's "directory" would delete every other wallet's
  // directory along with it while their registry rows survive, stranding
  // them on DataMissingScreen with unrecoverable data. The disk wipe is
  // skipped for that one entry; removal stays registry-only, matching the
  // web demo's list-only semantics for legacy entries. wipeAll (the
  // "clear all data" path) deliberately wipes the whole root and is
  // unaffected by this guard.
  const removeEntry = useCallback(
    async (entry: WalletEntry) => {
      if (activeEntry?.id === entry.id) {
        try {
          await stop();
        } catch {
          // Surfaced via wallet.error.
        }
      }
      const sharedRoot = await getDefaultDataDir();
      if (entry.dataDir !== sharedRoot) {
        await wipeLocalData(entry.dataDir).catch(() => undefined);
      }
      await removeWallet(entry.id);
      refresh();
    },
    [activeEntry, stop, refresh],
  );

  // wipeCurrentEntry removes the currently selected wallet (if any) and
  // returns to the wallet list. It backs the wipe affordances on the locked,
  // error and dashboard screens, where "clear wallet data" means the one
  // wallet in view rather than the whole device.
  const wipeCurrentEntry = useCallback(async () => {
    if (activeEntry) {
      await removeEntry(activeEntry);
    }
    await backToWallets();
  }, [activeEntry, removeEntry, backToWallets]);

  // wipeAll stops the runtime, deletes the shared data root recursively
  // (every wallet's directory lives under it), and clears the registry plus
  // the legacy single-wallet markers, then returns to the (now empty) list.
  const wipeAll = useCallback(async () => {
    try {
      await stop();
    } catch {
      // Surfaced via wallet.error.
    }
    const root = await getDefaultDataDir();
    await wipeLocalData(root).catch(() => undefined);
    await AsyncStorage.multiRemove([
      WALLETS_KEY,
      LEGACY_KIND_KEY,
      LEGACY_CREDENTIAL_KEY,
    ]);
    refresh();
    setSelectedWalletId(null);
    setPendingNetwork(null);
    setMnemonic([]);
    setBackupAcknowledged(false);
    setTab('home');
    setPreStart({ kind: 'list' });
  }, [stop, refresh]);

  // onWalletCreated records the freshly chosen unlock mode (and, for a
  // passkey wallet, the credential id) on the registry entry and stages the
  // recovery phrase for the backup screen. An imported passkey wallet
  // (opened from another device) returns no mnemonic, so its backup step is
  // skipped. The registry write is fire-and-forget: the UI transition below
  // does not depend on it, and updateWallet swallows its own storage
  // failures.
  const onWalletCreated = useCallback(
    (mnemonicWords: string[], kind: WalletKind, credentialId?: string) => {
      if (selectedWalletId) {
        void updateWallet(selectedWalletId, {
          walletKind: kind,
          ...(credentialId ? { credentialId } : {}),
          ...(pendingNetwork
            ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
            : {}),
          lastUsedAt: Date.now(),
        }).then(refresh);
        setPendingNetwork(null);
      }
      setMnemonic(mnemonicWords);
      setBackupAcknowledged(mnemonicWords.length === 0);
    },
    [selectedWalletId, pendingNetwork, refresh],
  );

  // onWalletRestored records a completed restore as a password wallet and
  // skips the backup screen: a restore is a phrase the user already holds.
  // It fires only once the restored wallet is up, so a restore that fails
  // before then leaves the entry unstamped and needsWallet re-renders the
  // restore form instead of the data-missing screen.
  const onWalletRestored = useCallback(() => {
    if (selectedWalletId) {
      void updateWallet(selectedWalletId, {
        walletKind: 'password',
        ...(pendingNetwork
          ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
          : {}),
        lastUsedAt: Date.now(),
      }).then(refresh);
      setPendingNetwork(null);
    }
    setMnemonic([]);
    setBackupAcknowledged(true);
  }, [selectedWalletId, pendingNetwork, refresh]);

  // onWalletUnlocked records the unlock mode (and, for a passkey unlock, the
  // credential id used) on the registry entry, resolving a legacy entry's
  // pendingNetwork guess into its permanent record, and moves straight to
  // the dashboard: an unlocked wallet's recovery phrase was already shown on
  // an earlier create.
  const onWalletUnlocked = useCallback(
    (kind: WalletKind, credentialId?: string) => {
      if (selectedWalletId) {
        void updateWallet(selectedWalletId, {
          walletKind: kind,
          ...(credentialId ? { credentialId } : {}),
          ...(pendingNetwork
            ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
            : {}),
          lastUsedAt: Date.now(),
        }).then(refresh);
        setPendingNetwork(null);
      }
      setBackupAcknowledged(true);
    },
    [selectedWalletId, pendingNetwork, refresh],
  );

  // recoverWithPhrase tears the runtime down so the user can rebuild the
  // wallet from a recovery phrase on the restore screen.
  const recoverWithPhrase = useCallback(async () => {
    await backToWallets();
    setPreStart({ kind: 'restore' });
  }, [backToWallets]);

  // acknowledgeBackup marks the recovery phrase as saved and drops it from
  // memory; it is never shown again this session.
  const acknowledgeBackup = useCallback(() => {
    setBackupAcknowledged(true);
    setMnemonic([]);
  }, []);

  const stopRuntime = useCallback(async () => {
    try {
      await stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab('home');
    } catch {
      // Surfaced via wallet.error.
    }
  }, [stop]);

  // renderPreStart renders the sub-screen shown while no wallet is running:
  // the wallet list, the create/restore form, or the legacy network picker.
  // Shared by the runtimeReady phase and by the stopped phase whenever no
  // wallet is currently selected. walletList is always the loaded registry
  // (never null): both call sites gate on the registry having finished
  // loading before reaching here.
  function renderPreStart(walletList: WalletEntry[]) {
    switch (preStart.kind) {
    case 'list':
      if (walletList.length === 0) {
        // First run: the create form directly, with the switch link
        // standing in for the list an empty registry cannot show, so
        // restore stays reachable on a fresh device.
        return (
          <WalletSetupScreen
            mode="create"
            regtestUnlocked={regtestUnlocked}
            onUnlockRegtest={() => setRegtestUnlocked(true)}
            onSubmit={(args) => void submitSetup('create', args)}
            onBack={null}
            onSwitchMode={() => setPreStart({ kind: 'restore' })}
            busy={runtimeBusy}
            error={setupError || (error?.message ?? '')}
          />
        );
      }

      return (
        <WalletListScreen
          wallets={walletList}
          onOpen={(entry) => void openWallet(entry)}
          onCreate={() => setPreStart({ kind: 'create' })}
          onRestore={() => setPreStart({ kind: 'restore' })}
          onRemove={(entry) => void removeEntry(entry)}
          onWipeAll={() => void wipeAll()}
          busy={runtimeBusy}
        />
      );

    case 'create':
    case 'restore': {
      // On first run there is no list to go back to, so only the
      // mode-switch link renders.
      const other = preStart.kind === 'create' ? 'restore' : 'create';

      return (
        <WalletSetupScreen
          mode={preStart.kind}
          regtestUnlocked={regtestUnlocked}
          onUnlockRegtest={() => setRegtestUnlocked(true)}
          onSubmit={(args) => void submitSetup(preStart.kind, args)}
          onBack={
            walletList.length > 0 ? () => setPreStart({ kind: 'list' }) : null
          }
          onSwitchMode={() => setPreStart({ kind: other })}
          busy={runtimeBusy}
          error={setupError || (error?.message ?? '')}
        />
      );
    }

    case 'chooseNetwork': {
      const entry = walletList.find((w) => w.id === preStart.entryId) ?? null;

      return (
        <ChooseNetworkScreen
          walletName={entry?.name ?? 'Wallet'}
          regtestUnlocked={regtestUnlocked}
          onUnlockRegtest={() => setRegtestUnlocked(true)}
          onSubmit={(chosenNetwork, endpoints) => {
            if (entry) {
              void openWallet(entry, { network: chosenNetwork, endpoints });
            }
          }}
          onBack={() => void backToWallets()}
          busy={runtimeBusy}
          error={error?.message ?? ''}
        />
      );
    }

    default:
      return null;
    }
  }

  switch (phase) {
  case 'loading':
    return (
      <LoadingScreen
        network={network}
        title="Starting Wavelength"
        sub="Initialising the embedded wallet runtime."
      />
    );

  case 'starting':
    return (
      <LoadingScreen
        network={network}
        title="Starting runtime"
        sub="Connecting to the servers."
      />
    );

  case 'stopping':
    return (
      <LoadingScreen
        network={network}
        title="Stopping runtime"
        sub="Tearing down the wallet."
      />
    );

  case 'runtimeReady':
    // AsyncStorage is async, so the registry can still be loading here; the
    // web demo has no equivalent gate since localStorage reads are
    // synchronous.
    if (wallets === null) {
      return (
        <LoadingScreen
          network={network}
          title="Loading wallets"
          sub="Reading the wallet list from storage."
        />
      );
    }

    return renderPreStart(wallets);

  case 'needsWallet':
    if (activeEntry?.walletKind) {
      // A completed wallet reported needsWallet while running on an
      // unproven legacy network guess: the guess was wrong, not the data
      // missing. Offer the picker again rather than the data-missing
      // screen, whose "Set up again" would poison the entry with the wrong
      // network.
      if (pendingNetwork) {
        return (
          <ChooseNetworkScreen
            walletName={activeEntry.name}
            regtestUnlocked={regtestUnlocked}
            onUnlockRegtest={() => setRegtestUnlocked(true)}
            onSubmit={(chosenNetwork, endpoints) =>
              void retryLegacyNetwork(chosenNetwork, endpoints)
            }
            onBack={() => void backToWallets()}
            busy={runtimeBusy}
            error="No wallet found on this network. Pick a different network and try again."
          />
        );
      }

      return (
        <DataMissingScreen
          walletName={activeEntry.name}
          network={network}
          onSetUpAgain={() => {
            void updateWallet(activeEntry.id, {
              walletKind: null,
              credentialId: null,
            }).then(refresh);
            // Match the screen's copy: setting up again means bringing back
            // the wallet the user already had, so land on restore. The list
            // remains the deliberate route to a fresh create.
            setOnboardingMode('restore');
          }}
          onRemove={() => void removeEntry(activeEntry).then(backToWallets)}
        />
      );
    }

    return (
      <OnboardingFlow
        network={network}
        // mode, walletName and onBack are not yet part of OnboardingFlow's
        // props (Task 4 adds them); passed here to match the target shape,
        // so tsc flags this call site until that lands.
        mode={onboardingMode}
        walletName={activeEntry?.name ?? 'My Wallet'}
        walletKind={activeEntry?.walletKind ?? null}
        credentialId={activeEntry?.credentialId ?? null}
        onWalletCreated={onWalletCreated}
        onWalletRestored={onWalletRestored}
        onWalletUnlocked={onWalletUnlocked}
        onBack={() => void backToWallets()}
      />
    );

  case 'locked':
    return (
      <UnlockScreen
        network={network}
        walletKind={activeEntry?.walletKind ?? null}
        credentialId={activeEntry?.credentialId ?? null}
        onWalletUnlocked={onWalletUnlocked}
        onRecover={() => void recoverWithPhrase()}
        onWipe={() => void wipeCurrentEntry()}
      />
    );

  case 'syncing':
  case 'restoring':
    return <SyncingScreen network={network} />;

  case 'stopped':
    if (activeEntry) {
      // The old wiped flag no longer exists: post-wipe flows return through
      // wipeCurrentEntry/wipeAll straight to the list rather than through
      // this branch.
      return (
        <StoppedScreen network={network} onBack={() => void backToWallets()} />
      );
    }

    if (wallets === null) {
      return (
        <LoadingScreen
          network={network}
          title="Loading wallets"
          sub="Reading the wallet list from storage."
        />
      );
    }

    return renderPreStart(wallets);

  case 'error':
    // The wallet_locked / runtime_lock_unavailable variants from the web
    // demo do not apply here: there is no multi-tab concept on a native app,
    // so every failure renders through the one generic ErrorScreen.
    return (
      <ErrorScreen
        network={network}
        message={error?.message ?? ''}
        onRetry={retryStart}
        onWipe={() => void wipeCurrentEntry()}
        onBack={() => void backToWallets()}
        busy={runtimeBusy}
      />
    );

  case 'ready':
  default:
    break;
  }

  // Freshly created wallet: show the recovery phrase once before the
  // dashboard becomes reachable.
  if (!backupAcknowledged && mnemonic.length > 0) {
    return (
      <BackupScreen
        network={network}
        mnemonic={mnemonic}
        onAcknowledge={acknowledgeBackup}
      />
    );
  }

  return (
    <AppShell tab={tab} onTab={setTab} network={network}>
      <RecoveryBanner />
      <ExitBanner onNavigate={setTab} />
      {tab === 'home' ? <HomeScreen onNavigate={setTab} /> : null}
      {tab === 'receive' ? <ReceiveScreen onNavigate={setTab} /> : null}
      {tab === 'send' ? (
        <SendScreen onNavigate={setTab} balanceSat={balanceSat(balance)} />
      ) : null}
      {tab === 'activity' ? <ActivityScreen onNavigate={setTab} /> : null}
      {tab === 'settings' && activeEntry ? (
        // form and onField no longer exist (RuntimeForm/RuntimeFieldSetter
        // were removed from lib/runtime-config in an earlier task);
        // SettingsScreen's own props still declare them until Task 6, so
        // this call site is expected to show missing-property errors.
        <SettingsScreen
          walletKind={activeEntry.walletKind}
          onStop={() => void stopRuntime()}
          onWipe={() => void wipeCurrentEntry()}
          onNavigate={setTab}
        />
      ) : null}
      {tab === 'exit' ? <ExitScreen onNavigate={setTab} /> : null}
    </AppShell>
  );
}
