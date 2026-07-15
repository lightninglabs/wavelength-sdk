import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
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
import { errorMessage } from './lib/errors';
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from './lib/usePollWhileWaiting';
import {
  RuntimeForm,
  defaultsForNetwork,
  signetDefaults,
} from './lib/runtime-config';
import { useWalletKind } from './lib/walletKind';
import { wipeLocalData } from './lib/wipeLocalData';
import { ActivityScreen } from './screens/activity/ActivityScreen';
import { HomeScreen } from './screens/home/HomeScreen';
import { BackupScreen } from './screens/onboarding/BackupScreen';
import { ConnectScreen } from './screens/onboarding/ConnectScreen';
import { ErrorScreen } from './screens/onboarding/ErrorScreen';
import { LoadingScreen } from './screens/onboarding/LoadingScreen';
import { OnboardingFlow } from './screens/onboarding/OnboardingFlow';
import { StoppedScreen } from './screens/onboarding/StoppedScreen';
import { SyncingScreen } from './screens/onboarding/SyncingScreen';
import { UnlockScreen } from './screens/onboarding/UnlockScreen';
import { ReceiveScreen } from './screens/receive/ReceiveScreen';
import { SendScreen } from './screens/send/SendScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { ExitScreen } from './screens/exit/ExitScreen';

// WalletApp is the wallet orchestrator: it owns cross-screen session state
// (the connect form, recovery-phrase backup gating, wallet-kind persistence,
// the active tab) and routes to the correct screen by runtime phase. The
// engine is owned by App.tsx (the app root) and reached through the granular
// provider hooks; each screen self-serves the wallet data, verbs and passkey
// ceremony it needs, so WalletApp only wires up what stays cross-cutting: the
// connect form, backup gating, wallet-kind persistence and the routing
// switch itself.
export function WalletApp() {
  const { phase, error, start, stop } = useWallet();
  // Kept only to drive the app-wide "poll while a boarding deposit or
  // exit/leave is pending" behavior below; never passed to a screen. Each
  // screen that displays balance or activity self-serves those hooks.
  const balance = useWalletBalance();
  const activity = useWalletActivity();
  const walletKind = useWalletKind();

  // Track pending on-chain activity to completion. Boarding deposits and
  // exits/leaves are not pushed on the activity stream, so without this a
  // pending row would sit stale until a manual refresh. Lightning/credit
  // send+receive are stream-backed and excluded. Runs app-wide so it keeps
  // going after the waiting screen unmounts.
  usePollWhileWaiting(hasPendingOnchain(activity, balance));

  const [form, setForm] = useState<RuntimeForm>(signetDefaults);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [tab, setTab] = useState<AppTab>('home');
  // wiped keeps the post-wipe screen on Connect (the phase lands on
  // 'stopped', which otherwise renders the StoppedScreen); the next start
  // clears it.
  const [wiped, setWiped] = useState(false);

  // A failed start() (or stop()) surfaces on the 'error' phase, so a plain
  // 'starting'/'stopping' spinner needs no error affordance of its own.
  const runtimeBusy = phase === 'starting' || phase === 'stopping';

  // The data dir is platform-resolved once and displayed in the connect and
  // settings forms; the wipe deletes the same path.
  useEffect(() => {
    getDefaultDataDir().then(
      (dir) => setForm((f) => ({ ...f, dataDir: dir })),
      () => undefined,
    );
  }, []);

  // onField updates a single runtime-config field (connect + settings forms).
  const onField = useCallback(
    <K extends keyof RuntimeForm>(key: K, value: RuntimeForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  // onNetworkChange resets the form to the network preset, preserving the
  // resolved data dir.
  const onNetworkChange = useCallback(
    (network: RuntimeForm['network']) => {
      setForm((current) => ({
        ...defaultsForNetwork(network),
        dataDir: current.dataDir,
      }));
    },
    [],
  );

  const startRuntime = useCallback(async () => {
    setWiped(false);
    try {
      const startedInfo = await start({
        ...form,
        dataDir: form.dataDir || undefined,
      });
      setBackupAcknowledged(Boolean(startedInfo.walletReady));
    } catch {
      // Surfaced via wallet.error (the phase moves to 'error').
    }
  }, [start, form]);

  // onWalletCreated records the freshly chosen unlock mode (and, for a
  // passkey wallet, the credential id) and stages the recovery phrase for the
  // backup screen. An imported passkey wallet (opened from another device)
  // returns no mnemonic, so its backup step is skipped. record is
  // fire-and-forget: its in-memory state updates synchronously, and its
  // AsyncStorage write already swallows its own rejection.
  const onWalletCreated = useCallback(
    (mnemonicWords: string[], kind: WalletKind, credentialId?: string) => {
      void walletKind.record(kind, credentialId).catch(() => undefined);
      setMnemonic(mnemonicWords);
      setBackupAcknowledged(mnemonicWords.length === 0);
    },
    [walletKind],
  );

  // onRestoreStarted records a restore as a password wallet and skips the
  // backup screen: a restore is a phrase the user already holds.
  const onRestoreStarted = useCallback(() => {
    void walletKind.record('password').catch(() => undefined);
    setMnemonic([]);
    setBackupAcknowledged(true);
  }, [walletKind]);

  // onWalletUnlocked records the unlock mode (and, for a passkey unlock, the
  // credential id used) and moves straight to the dashboard: an unlocked
  // wallet's recovery phrase was already shown on an earlier create.
  const onWalletUnlocked = useCallback(
    (kind: WalletKind, credentialId?: string) => {
      void walletKind.record(kind, credentialId).catch(() => undefined);
      setBackupAcknowledged(true);
    },
    [walletKind],
  );

  // recoverWithPhrase tears the runtime down so the user can reconnect and
  // rebuild the wallet from a recovery phrase on the create/restore screen.
  const recoverWithPhrase = useCallback(async () => {
    try {
      await stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab('home');
    } catch {
      // Surfaced via wallet.error.
    }
  }, [stop]);

  // onAcknowledgeBackup marks the recovery phrase as saved and drops it from
  // memory; it is never shown again this session.
  const onAcknowledgeBackup = useCallback(() => {
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

  // wipeData stops the runtime (closing the daemon's SQLite handles), deletes
  // the data directory, clears the stored wallet markers, and resets the
  // session state. The theme preference survives by design. A failed deletion
  // must never look like a success: the confirmation dialog promises the data
  // is gone, so a failure surfaces an alert and leaves the wallet in place
  // rather than silently proceeding to the connect screen.
  const wipeData = useCallback(async () => {
    try {
      await stop();
    } catch {
      // A failed stop still proceeds to the wipe: the runtime may already be
      // down, and the deletion is the user's explicit intent.
    }
    try {
      // Resolve the data dir at wipe time: if the mount-time resolution failed,
      // form.dataDir is empty, and deleting nothing must not report success.
      const dataDir = form.dataDir || (await getDefaultDataDir());
      await wipeLocalData(dataDir);
    } catch (err) {
      Alert.alert('Could not clear wallet data', errorMessage(err));

      return;
    }
    await walletKind.clear();
    setMnemonic([]);
    setBackupAcknowledged(false);
    setTab('home');
    setWiped(true);
  }, [stop, form.dataDir, walletKind]);

  const network = form.network;

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
      return (
        <ConnectScreen
          form={form}
          onField={onField}
          onNetworkChange={onNetworkChange}
          onStart={() => void startRuntime()}
          onWipe={() => void wipeData()}
          busy={runtimeBusy}
          error={error?.message ?? ''}
        />
      );

    case 'needsWallet':
      return (
        <OnboardingFlow
          network={network}
          walletKind={walletKind.kind}
          credentialId={walletKind.credentialId}
          onWalletCreated={onWalletCreated}
          onRestoreStarted={onRestoreStarted}
          onWalletUnlocked={onWalletUnlocked}
        />
      );

    case 'locked':
      return (
        <UnlockScreen
          network={network}
          walletKind={walletKind.kind}
          credentialId={walletKind.credentialId}
          onWalletUnlocked={onWalletUnlocked}
          onRecover={() => void recoverWithPhrase()}
          onWipe={() => void wipeData()}
        />
      );

    case 'syncing':
    case 'restoring':
      return <SyncingScreen network={network} />;

    case 'stopped':
      if (wiped) {
        return (
          <ConnectScreen
            form={form}
            onField={onField}
            onNetworkChange={onNetworkChange}
            onStart={() => void startRuntime()}
            onWipe={() => void wipeData()}
            busy={runtimeBusy}
            error={error?.message ?? ''}
          />
        );
      }

      return (
        <StoppedScreen
          network={network}
          onStart={() => void startRuntime()}
          busy={runtimeBusy}
        />
      );

    case 'error':
      return (
        <ErrorScreen
          network={network}
          message={error?.message ?? ''}
          onRetry={() => void startRuntime()}
          onWipe={() => void wipeData()}
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
        onAcknowledge={onAcknowledgeBackup}
      />
    );
  }

  return (
    <AppShell tab={tab} onTab={setTab} network={network}>
      <RecoveryBanner />
      <ExitBanner onNavigate={setTab} />
      {tab === 'home' ? (
        <HomeScreen onNavigate={setTab} />
      ) : null}
      {tab === 'receive' ? (
        <ReceiveScreen onNavigate={setTab} />
      ) : null}
      {tab === 'send' ? (
        <SendScreen onNavigate={setTab} balanceSat={balanceSat(balance)} />
      ) : null}
      {tab === 'activity' ? <ActivityScreen onNavigate={setTab} /> : null}
      {tab === 'settings' ? (
        <SettingsScreen
          form={form}
          walletKind={walletKind.kind}
          onField={onField}
          onStop={() => void stopRuntime()}
          onWipe={() => void wipeData()}
          onNavigate={setTab}
        />
      ) : null}
      {tab === 'exit' ? <ExitScreen onNavigate={setTab} /> : null}
    </AppShell>
  );
}
