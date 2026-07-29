import { useCallback, useMemo, useState } from "react";
import {
  useWallet,
  useWalletActivity,
  useWalletBalance,
} from "@lightninglabs/wavelength-react";
import type { WalletKind, WavelengthError } from "@lightninglabs/wavelength-react";
import { AppShell } from "./components/layout/AppShell";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { ExitBanner } from "./components/ExitBanner";
import { AppTab } from "./components/layout/nav";
import { balanceSat } from "./lib/balance";
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from "./lib/usePollWhileWaiting";
import {
  addWallet,
  loadWallets,
  newWalletEntry,
  removeWallet,
  runtimeConfigForEntry,
  updateWallet,
  WalletEntry,
} from "./lib/walletRegistry";
import { RuntimeNetwork, WalletEndpoints } from "./lib/runtime-config";
import { HomeScreen } from "./screens/home";
import { OnboardingFlow } from "./screens/onboarding/OnboardingFlow";
import {
  BackupScreen,
  ChooseNetworkScreen,
  DataMissingScreen,
  ErrorScreen,
  LoadingScreen,
  StoppedScreen,
  SyncingScreen,
  UnlockScreen,
  WalletListScreen,
  WalletSetupScreen,
} from "./screens/onboarding";
import { ReceiveScreen } from "./screens/receive";
import { SendScreen } from "./screens/send";
import { ActivityScreen } from "./screens/activity";
import { SettingsScreen } from "./screens/settings";
import { ExitScreen } from "./screens/exit";

// App is the wallet orchestrator: it owns cross-screen session state (which
// registry entry is selected, the pre-start sub-screen shown while no wallet
// is running, recovery-phrase backup gating, the active tab) and routes to
// the correct screen by runtime phase. The registry (lib/walletRegistry) is
// the source of truth for which wallets exist; the engine itself only ever
// knows about the one entry currently started. The engine is owned by
// main.tsx and reached through the granular provider hooks; each screen
// self-serves the wallet data, verbs and passkey ceremony it needs, so App
// only wires up what stays cross-cutting: registry selection, the pre-start
// routing, backup gating and the phase routing switch itself.
export function App() {
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

  const [walletsVersion, setWalletsVersion] = useState(0);
  const wallets = useMemo(() => loadWallets(), [walletsVersion]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  // preStart is the sub-screen shown while no wallet is running: the list, the
  // create/restore form, or the legacy network picker for the entry being opened.
  const [preStart, setPreStart] = useState<
    | { kind: "list" }
    | { kind: "create" }
    | { kind: "restore" }
    | { kind: "chooseNetwork"; entryId: string }
  >({ kind: "list" });
  const activeEntry = wallets.find((w) => w.id === selectedWalletId) ?? null;
  // pendingNetwork holds a legacy entry's unpersisted network guess until an
  // unlock proves it right.
  const [pendingNetwork, setPendingNetwork] = useState<
    { network: RuntimeNetwork; endpoints: WalletEndpoints } | null
  >(null);
  const [onboardingMode, setOnboardingMode] = useState<"create" | "restore">(
    "create",
  );

  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [tab, setTab] = useState<AppTab>("home");

  // A failed start() (or stop()) surfaces on the 'error' phase, so the
  // 'starting'/'stopping' spinner needs no error affordance of its own.
  const runtimeBusy = phase === "starting" || phase === "stopping";

  // Derived display network: pendingNetwork (a legacy entry's unproven guess)
  // wins while it is set, then the entry's own recorded network, then a
  // fallback for screens rendered before any wallet is selected.
  const network = pendingNetwork?.network ?? activeEntry?.network ?? "signet";

  // openWallet starts the runtime for a registry entry. Legacy entries with no
  // recorded network detour through the network picker first. The mode is what
  // onboarding renders in if the daemon reports needsWallet; it defaults to
  // create so an unfinished entry always resumes deterministically instead of
  // in whatever mode a prior session left behind.
  const openWallet = useCallback(
    async (
      entry: WalletEntry,
      override?: { network: RuntimeNetwork; endpoints: WalletEndpoints },
      mode: "create" | "restore" = "create",
    ) => {
      if (!entry.network && !override) {
        setSelectedWalletId(entry.id);
        setPreStart({ kind: "chooseNetwork", entryId: entry.id });

        return;
      }
      setSelectedWalletId(entry.id);
      setPendingNetwork(override ?? null);
      setOnboardingMode(mode);
      // Assembled outside the try so a malformed hand-edited entry throws
      // visibly instead of the open click being a silent no-op.
      const config = runtimeConfigForEntry(entry, override);
      try {
        const startedInfo = await start(config);
        setBackupAcknowledged(Boolean(startedInfo.walletReady));
      } catch {
        // Surfaced via wallet.error (the phase moves to 'error').
      }
    },
    [start],
  );

  // submitSetup registers the entry, then starts the runtime; the daemon
  // reports needsWallet and onboarding renders in the chosen mode.
  const submitSetup = useCallback(
    async (
      mode: "create" | "restore",
      args: { name: string; network: RuntimeNetwork; endpoints: WalletEndpoints },
    ) => {
      const entry = newWalletEntry(args);
      addWallet(entry);
      setWalletsVersion((v) => v + 1);
      await openWallet(entry, undefined, mode);
    },
    [openWallet],
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
    setPreStart({ kind: "list" });
    setMnemonic([]);
    setBackupAcknowledged(false);
    setTab("home");
  }, [stop]);

  // retryStart re-runs the failed start against the entry that was selected
  // when it failed, keeping the onboarding mode the failed attempt was headed
  // for; with no selection (a stale error from a prior session) it falls back
  // to the wallet list instead.
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

  // onWalletCreated records the freshly chosen unlock mode (and, for a
  // passkey wallet, the credential id) on the registry entry and stages the
  // recovery phrase for the backup screen. An imported passkey wallet
  // (opened from another device) returns no mnemonic, so its backup step is
  // skipped. updateWallet swallows storage failures itself, so no guard is
  // needed here the way the old localStorage writes required one.
  const onWalletCreated = useCallback(
    (mnemonicWords: string[], kind: WalletKind, credentialId?: string) => {
      if (selectedWalletId) {
        updateWallet(selectedWalletId, {
          walletKind: kind,
          ...(credentialId ? { credentialId } : {}),
          ...(pendingNetwork
            ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
            : {}),
          lastUsedAt: Date.now(),
        });
        setWalletsVersion((v) => v + 1);
        setPendingNetwork(null);
      }
      setMnemonic(mnemonicWords);
      setBackupAcknowledged(mnemonicWords.length === 0);
    },
    [selectedWalletId, pendingNetwork],
  );

  // onWalletRestored records a completed restore as a password wallet and
  // skips the backup screen: a restore is a phrase the user already holds.
  // It fires only once the restored wallet is up, so a restore that fails
  // before then leaves the entry unstamped and needsWallet re-renders the
  // restore form instead of the data-missing screen.
  const onWalletRestored = useCallback(() => {
    if (selectedWalletId) {
      updateWallet(selectedWalletId, {
        walletKind: "password",
        ...(pendingNetwork
          ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
          : {}),
        lastUsedAt: Date.now(),
      });
      setWalletsVersion((v) => v + 1);
      setPendingNetwork(null);
    }
    setMnemonic([]);
    setBackupAcknowledged(true);
  }, [selectedWalletId, pendingNetwork]);

  // onWalletUnlocked records the unlock mode (and, for a passkey unlock, the
  // credential id used) on the registry entry, resolving a legacy entry's
  // pendingNetwork guess into its permanent record, and moves straight to the
  // dashboard: an unlocked wallet's recovery phrase was already shown on an
  // earlier create.
  const onWalletUnlocked = useCallback(
    (kind: WalletKind, credentialId?: string) => {
      if (selectedWalletId) {
        updateWallet(selectedWalletId, {
          walletKind: kind,
          ...(credentialId ? { credentialId } : {}),
          ...(pendingNetwork
            ? { network: pendingNetwork.network, endpoints: pendingNetwork.endpoints }
            : {}),
          lastUsedAt: Date.now(),
        });
        setWalletsVersion((v) => v + 1);
        setPendingNetwork(null);
      }
      setBackupAcknowledged(true);
    },
    [selectedWalletId, pendingNetwork],
  );

  // recoverWithPhrase tears the runtime down so the user can rebuild the
  // wallet from a recovery phrase on the restore screen.
  const recoverWithPhrase = useCallback(async () => {
    await backToWallets();
    setPreStart({ kind: "restore" });
  }, [backToWallets]);

  // acknowledgeBackup marks the recovery phrase as saved, moving the user
  // from the backup screen to the dashboard.
  const acknowledgeBackup = useCallback(() => {
    setBackupAcknowledged(true);
  }, []);

  const stopRuntime = useCallback(async () => {
    try {
      await stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab("home");
    } catch {
      // Surfaced via wallet.error.
    }
  }, [stop]);

  // renderPreStart renders the sub-screen shown while no wallet is running:
  // the wallet list, the create/restore form, or the legacy network picker.
  // Shared by the runtimeReady phase and by the stopped phase whenever no
  // wallet is currently selected.
  function renderPreStart() {
    switch (preStart.kind) {
    case "list":
      if (wallets.length === 0) {
        // First run: the create form directly, with the switch link standing
        // in for the list an empty registry cannot show, so restore stays
        // reachable on a fresh browser.
        return (
          <WalletSetupScreen
            mode="create"
            onSubmit={(args) => void submitSetup("create", args)}
            onBack={null}
            onSwitchMode={() => setPreStart({ kind: "restore" })}
            busy={runtimeBusy}
            error={error?.message ?? ""}
          />
        );
      }

      return (
        <WalletListScreen
          wallets={wallets}
          onOpen={(entry) => void openWallet(entry)}
          onCreate={() => setPreStart({ kind: "create" })}
          onRestore={() => setPreStart({ kind: "restore" })}
          onRemove={(entry) => {
            removeWallet(entry.id);
            setWalletsVersion((v) => v + 1);
          }}
          busy={runtimeBusy}
        />
      );

    case "create":
    case "restore": {
      // On first run there is no list to go back to, so only the mode-switch
      // link renders.
      const other = preStart.kind === "create" ? "restore" : "create";

      return (
        <WalletSetupScreen
          mode={preStart.kind}
          onSubmit={(args) => void submitSetup(preStart.kind, args)}
          onBack={
            wallets.length > 0 ? () => setPreStart({ kind: "list" }) : null
          }
          onSwitchMode={() => setPreStart({ kind: other })}
          busy={runtimeBusy}
          error={error?.message ?? ""}
        />
      );
    }

    case "chooseNetwork": {
      const entry = wallets.find((w) => w.id === preStart.entryId) ?? null;

      return (
        <ChooseNetworkScreen
          walletName={entry?.name ?? "Wallet"}
          onSubmit={(chosenNetwork, endpoints) => {
            if (entry) {
              void openWallet(entry, { network: chosenNetwork, endpoints });
            }
          }}
          onBack={() => void backToWallets()}
          busy={runtimeBusy}
          error={error?.message ?? ""}
        />
      );
    }

    default:
      return null;
    }
  }

  switch (phase) {
  case "loading":
    return (
      <LoadingScreen
        network={network}
        title="Starting Wavelength"
        sub="Downloading and instantiating the WASM runtime."
      />
    );

  case "starting":
    return (
      <LoadingScreen
        network={network}
        title="Starting runtime"
        sub="Connecting to the servers."
      />
    );

  case "stopping":
    return (
      <LoadingScreen
        network={network}
        title="Stopping runtime"
        sub="Tearing down the wallet."
      />
    );

  case "runtimeReady":
    return renderPreStart();

  case "needsWallet":
    if (activeEntry?.walletKind) {
      // A completed wallet reported needsWallet while running on an unproven
      // legacy network guess: the guess was wrong, not the data missing. Offer
      // the picker again rather than the data-missing screen, whose "Set up
      // again" would poison the entry with the wrong network.
      if (pendingNetwork) {
        return (
          <ChooseNetworkScreen
            walletName={activeEntry.name}
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
            updateWallet(activeEntry.id, { walletKind: null, credentialId: null });
            setWalletsVersion((v) => v + 1);
            // Match the screen's copy: setting up again means bringing back
            // the wallet the user already had, so land on restore. The list
            // remains the deliberate route to a fresh create.
            setOnboardingMode("restore");
          }}
          onRemove={() => {
            removeWallet(activeEntry.id);
            setWalletsVersion((v) => v + 1);
            void backToWallets();
          }}
        />
      );
    }

    return (
      <OnboardingFlow
        network={network}
        mode={onboardingMode}
        walletName={activeEntry?.name ?? "My Wallet"}
        onWalletCreated={onWalletCreated}
        onWalletRestored={onWalletRestored}
        onWalletUnlocked={onWalletUnlocked}
        onBack={() => void backToWallets()}
      />
    );

  case "locked":
    return (
      <UnlockScreen
        network={network}
        walletKind={activeEntry?.walletKind ?? null}
        credentialId={activeEntry?.credentialId ?? null}
        walletName={activeEntry?.name ?? "My Wallet"}
        onWalletUnlocked={onWalletUnlocked}
        onBack={() => void backToWallets()}
        onRemove={() => {
          if (activeEntry) {
            removeWallet(activeEntry.id);
            setWalletsVersion((v) => v + 1);
          }
          void backToWallets();
        }}
        onRecover={recoverWithPhrase}
      />
    );

  case "syncing":
  case "restoring":
    return <SyncingScreen network={network} />;

  case "stopped":
    if (activeEntry) {
      return (
        <StoppedScreen network={network} onBack={() => void backToWallets()} />
      );
    }

    return renderPreStart();

  case "error": {
    // Duck-typed on `code` rather than instanceof: a duplicate bundled copy
    // of core (the hazard core's isPasskeyCancelled documents) would fail
    // instanceof and silently downgrade these expected conditions to the
    // generic screen, wipe button included.
    const errorCode = (error as WavelengthError | null)?.code;

    // A wallet_locked failure is an expected multi-tab condition, not a
    // runtime fault: another tab of this origin holds the wallet's exclusive
    // OPFS databases. Swap the raw error surface for actionable copy; the
    // retry succeeds once the other tab stops the runtime or closes.
    if (errorCode === "wallet_locked") {
      return (
        <ErrorScreen
          network={network}
          title="Wallet open in another tab"
          sub="Only one tab can run the wallet at a time."
          message="This wallet is already running in another tab or window. Close it there (or stop its runtime), then press Try again."
          onRetry={retryStart}
          onBack={() => void backToWallets()}
          busy={runtimeBusy}
          showWipe={false}
        />
      );
    }

    // The browser refused the lock request itself, which says nothing about
    // the wallet data. Retrying is the whole remedy, so keep the destructive
    // wipe affordance out of it.
    if (errorCode === "runtime_lock_unavailable") {
      return (
        <ErrorScreen
          network={network}
          title="Could not start just now"
          sub="The browser would not hand over the wallet runtime lock."
          message="Something interrupted the wallet as it was starting. Press Try again."
          onRetry={retryStart}
          onBack={() => void backToWallets()}
          busy={runtimeBusy}
          showWipe={false}
        />
      );
    }

    return (
      <ErrorScreen
        network={network}
        message={error?.message ?? ""}
        onRetry={retryStart}
        onBack={() => void backToWallets()}
        busy={runtimeBusy}
      />
    );
  }

  case "ready":
  default:
    break;
  }

  // Freshly created wallet: show the recovery phrase once before the dashboard.
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
    <AppShell tab={tab} onTab={setTab} onStop={stopRuntime} network={network}>
      <RecoveryBanner />
      <ExitBanner onNavigate={setTab} />
      {tab === "home" ? <HomeScreen onNavigate={setTab} /> : null}
      {tab === "receive" ? <ReceiveScreen onNavigate={setTab} /> : null}
      {tab === "send" ? (
        <SendScreen onNavigate={setTab} balanceSat={balanceSat(balance)} />
      ) : null}
      {tab === "activity" ? <ActivityScreen onNavigate={setTab} /> : null}
      {tab === "settings" ? (
        <SettingsScreen
          entry={activeEntry}
          onSwitchWallet={() => void backToWallets()}
          onDeleteWallet={() => {
            if (activeEntry) {
              removeWallet(activeEntry.id);
              setWalletsVersion((v) => v + 1);
            }
            void backToWallets();
          }}
          onStop={stopRuntime}
          onNavigate={setTab}
        />
      ) : null}
      {tab === "exit" ? <ExitScreen onNavigate={setTab} /> : null}
    </AppShell>
  );
}
