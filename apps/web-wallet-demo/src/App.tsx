import { useCallback, useMemo, useState } from "react";
import {
  useWallet,
  useWalletActivity,
  useWalletBalance,
} from "@lightninglabs/wavelength-react";
import type { WalletKind } from "@lightninglabs/wavelength-react";
import { AppShell } from "./components/layout/AppShell";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { AppTab } from "./components/layout/nav";
import { balanceSat } from "./lib/balance";
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from "./lib/usePollWhileWaiting";
import {
  RuntimeForm,
  defaultsForNetwork,
  signetDefaults,
} from "./lib/runtime-config";
import {
  readWalletKind,
  writePasskeyCredentialId,
  writeWalletKind,
} from "./lib/walletKind";
import { HomeScreen } from "./screens/home";
import { OnboardingFlow } from "./screens/onboarding/OnboardingFlow";
import {
  BackupScreen,
  ConnectScreen,
  ErrorScreen,
  LoadingScreen,
  StoppedScreen,
  SyncingScreen,
  UnlockScreen,
} from "./screens/onboarding";
import { ReceiveScreen } from "./screens/receive";
import { SendScreen } from "./screens/send";
import { ActivityScreen } from "./screens/activity";
import { SettingsScreen } from "./screens/settings";

// App is the wallet orchestrator: it owns cross-screen session state (the
// connect form, recovery-phrase backup gating, wallet-kind persistence, the
// active tab) and routes to the correct screen by runtime phase. The engine
// is owned by main.tsx and reached through the granular provider hooks; each
// screen self-serves the wallet data, verbs and passkey ceremony it needs, so
// App only wires up what stays cross-cutting: the connect form, backup
// gating, wallet-kind persistence and the routing switch itself.
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

  const [form, setForm] = useState<RuntimeForm>(signetDefaults);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [tab, setTab] = useState<AppTab>("home");
  const [kindVersion, setKindVersion] = useState(0);

  // A failed start() (or stop()) surfaces on the 'error' phase, so the
  // 'starting'/'stopping' spinner needs no error affordance of its own.
  const runtimeBusy = phase === "starting" || phase === "stopping";

  // onField updates a single runtime-config field (connect + settings forms).
  const onField = useCallback(
    <K extends keyof RuntimeForm>(key: K, value: RuntimeForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onNetworkChange = useCallback(
    (network: RuntimeForm["network"]) => {
      setForm(defaultsForNetwork(network));
    },
    [],
  );

  // walletKind is the locally recorded unlock mode for the active data dir; it
  // drives which unlock affordances the locked/settings screens show. kindVersion
  // forces a re-read after a create or unlock writes the marker to localStorage,
  // which is untracked by React.
  const walletKind = useMemo(
    () => readWalletKind(form.dataDir),
    [form.dataDir, kindVersion],
  );

  const startRuntime = useCallback(async () => {
    try {
      const startedInfo = await start(form);
      setBackupAcknowledged(Boolean(startedInfo.walletReady));
    } catch {
      // Surfaced via wallet.error (the phase moves to 'error').
    }
  }, [start, form]);

  // onWalletCreated records the freshly chosen unlock mode (and, for a
  // passkey wallet, the credential id) and stages the recovery phrase for the
  // backup screen. An imported passkey wallet (opened from another device)
  // returns no mnemonic, so its backup step is skipped. Guard the localStorage
  // writes (they can throw under quota / private mode) so a storage failure
  // cannot swallow the backup screen for a wallet that was actually created;
  // the kind/credential markers only influence which unlock affordance shows
  // later.
  const onWalletCreated = useCallback(
    (mnemonicWords: string[], kind: WalletKind, credentialId?: string) => {
      try {
        writeWalletKind(form.dataDir, kind);
        if (credentialId) {
          writePasskeyCredentialId(form.dataDir, credentialId);
        }
      } catch {
        // Non-fatal: proceed without the persisted wallet-kind marker.
      }
      setKindVersion((v) => v + 1);
      setMnemonic(mnemonicWords);
      setBackupAcknowledged(mnemonicWords.length === 0);
    },
    [form.dataDir],
  );

  // onRestoreStarted records a restore as a password wallet and skips the
  // backup screen: a restore is a phrase the user already holds. Guard the
  // localStorage write (it can throw under quota / private mode) so a
  // storage failure does not abort the rest of the restore transition; the
  // kind marker only influences which unlock affordance shows later.
  const onRestoreStarted = useCallback(() => {
    try {
      writeWalletKind(form.dataDir, "password");
      setKindVersion((v) => v + 1);
    } catch {
      // Non-fatal: proceed without the persisted wallet-kind marker.
    }
    setMnemonic([]);
    setBackupAcknowledged(true);
  }, [form.dataDir]);

  // onWalletUnlocked records the unlock mode (and, for a passkey unlock, the
  // credential id used) and moves straight to the dashboard: an unlocked
  // wallet's recovery phrase was already shown on an earlier create. Guard
  // the localStorage writes (they can throw under quota / private mode) so a
  // storage failure cannot block the unlocked wallet from reaching the
  // dashboard; the kind/credential markers only influence which unlock
  // affordance shows later.
  const onWalletUnlocked = useCallback(
    (kind: WalletKind, credentialId?: string) => {
      try {
        writeWalletKind(form.dataDir, kind);
        if (credentialId) {
          writePasskeyCredentialId(form.dataDir, credentialId);
        }
      } catch {
        // Non-fatal: proceed without the persisted wallet-kind marker.
      }
      setKindVersion((v) => v + 1);
      setBackupAcknowledged(true);
    },
    [form.dataDir],
  );

  // recoverWithPhrase tears the runtime down so the user can reconnect and
  // rebuild the wallet from a recovery phrase on the create/restore screen.
  const recoverWithPhrase = useCallback(async () => {
    try {
      await stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab("home");
    } catch {
      // Surfaced via wallet.error.
    }
  }, [stop]);

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

  const network = form.network;

  switch (phase) {
  case "loading":
    return (
      <LoadingScreen
        network={network}
        title="Starting WalletDK"
        sub="Downloading and instantiating the WASM runtime."
      />
    );

  case "starting":
    return (
      <LoadingScreen
        network={network}
        title="Starting runtime"
        sub="Connecting to the gateways."
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
    return (
      <ConnectScreen
        form={form}
        onField={onField}
        onNetworkChange={onNetworkChange}
        onStart={startRuntime}
        busy={runtimeBusy}
        error={error?.message ?? ""}
      />
    );

  case "needsWallet":
    return (
      <OnboardingFlow
        network={network}
        dataDir={form.dataDir}
        onWalletCreated={onWalletCreated}
        onRestoreStarted={onRestoreStarted}
        onWalletUnlocked={onWalletUnlocked}
      />
    );

  case "locked":
    return (
      <UnlockScreen
        network={network}
        dataDir={form.dataDir}
        walletKind={walletKind}
        onWalletUnlocked={onWalletUnlocked}
        onRecover={recoverWithPhrase}
      />
    );

  case "syncing":
  case "restoring":
    return <SyncingScreen network={network} />;

  case "stopped":
    return (
      <StoppedScreen network={network} onStart={startRuntime} busy={runtimeBusy} />
    );

  case "error":
    return (
      <ErrorScreen
        network={network}
        message={error?.message ?? ""}
        onRetry={startRuntime}
        busy={runtimeBusy}
      />
    );

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
      {tab === "home" ? <HomeScreen onNavigate={setTab} /> : null}
      {tab === "receive" ? <ReceiveScreen onNavigate={setTab} /> : null}
      {tab === "send" ? (
        <SendScreen onNavigate={setTab} balanceSat={balanceSat(balance)} />
      ) : null}
      {tab === "activity" ? <ActivityScreen onNavigate={setTab} /> : null}
      {tab === "settings" ? (
        <SettingsScreen
          form={form}
          onField={onField}
          walletKind={walletKind}
          onStop={stopRuntime}
          onNavigate={setTab}
        />
      ) : null}
    </AppShell>
  );
}
