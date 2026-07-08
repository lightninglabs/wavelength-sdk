import { useCallback, useEffect, useMemo, useState } from "react";
import { useWalletDK, usePasskeyWallet } from "@lightninglabs/walletdk-react";
import { webPasskeyCeremony } from "@lightninglabs/walletdk-web";
import { AppShell } from "./components/layout/AppShell";
import { RecoveryBanner } from "./components/RecoveryBanner";
import { AppTab } from "./components/layout/nav";
import { balanceSat } from "./lib/balance";
import { phaseConnected, statusLabel } from "./lib/phase";
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
  readPasskeyCredentialId,
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
  type LogRow,
  StoppedScreen,
  SyncingScreen,
  UnlockScreen,
} from "./screens/onboarding";
import { ReceiveScreen } from "./screens/receive";
import { SendScreen } from "./screens/send";
import { ActivityScreen } from "./screens/activity";
import { SettingsScreen } from "./screens/settings";

const APP_NAME = "WalletDK Demo";

// passkeyName labels a freshly created passkey with the app name plus a
// timestamp, so multiple test passkeys stay distinguishable in the OS prompt.
function passkeyName(): string {
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${APP_NAME} · ${stamp}`;
}
const MAX_LOGS = 8;

// App is the wallet orchestrator: it owns cross-screen session state (runtime
// form, recovery-phrase backup gating, passkey wiring, log tail, active tab) and
// routes to the correct screen by runtime phase. The data layer lives in
// WalletDKProvider; presentational screens receive values + handlers as props.
// The passkey hook is given the browser ceremony (webPasskeyCeremony) and pulls
// the client + refresh from the provider, so it opens the wallet and advances
// the phase on its own.
export function App() {
  const wallet = useWalletDK();
  const passkey = usePasskeyWallet(webPasskeyCeremony);

  // Track pending on-chain activity to completion. Boarding deposits and
  // exits/leaves are not pushed on the activity stream, so without this a
  // pending row would sit stale until a manual refresh. Lightning/credit
  // send+receive are stream-backed and excluded. Runs app-wide so it keeps
  // going after the waiting screen unmounts.
  usePollWhileWaiting(hasPendingOnchain(wallet.activity, wallet.balance));

  // The refresh spinner should reflect only user-initiated refreshes, not the
  // background poll (which shares operations.refresh via the provider). Track a
  // local busy flag for the manual button instead.
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const onManualRefresh = useCallback(() => {
    setManualRefreshing(true);
    void wallet
      .refresh()
      .catch(() => undefined)
      .finally(() => setManualRefreshing(false));
  }, [wallet]);

  const [form, setForm] = useState<RuntimeForm>(signetDefaults);
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<AppTab>("home");
  const [kindVersion, setKindVersion] = useState(0);
  const [enrolling, setEnrolling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const phaseLabel = statusLabel(wallet.phase);

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

  // Tail the runtime log stream so the syncing screen can show live progress.
  useEffect(() => {
    return wallet.client.subscribe((event) => {
      if (event.type !== "log") {
        return;
      }

      const { message } = event.payload;
      if (!message) {
        return;
      }

      setLogs((rows) =>
        [
          { time: new Date().toLocaleTimeString(), message },
          ...rows,
        ].slice(0, MAX_LOGS),
      );
    });
  }, [wallet.client]);

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
      const info = await wallet.start(form);
      setBackupAcknowledged(Boolean(info.walletReady));
    } catch {
      // Surfaced via operations.runtime.error / wallet.error.
    }
  }, [wallet, form]);

  // createPasswordWallet runs the classic password create path: it generates a
  // fresh seed, records the wallet as a password wallet and reveals the recovery
  // phrase on the backup screen.
  const createPasswordWallet = useCallback(
    async (password: string) => {
      const result = await wallet.createWallet({ password }).catch(() => null);
      if (!result) {
        // Surfaced via operations.createWallet.error.
        return;
      }

      writeWalletKind(form.dataDir, "password");
      setKindVersion((v) => v + 1);
      setMnemonic(result.mnemonic || []);
      setBackupAcknowledged(false);
    },
    [wallet, form.dataDir],
  );

  // createPasskeyWallet derives the seed and DB password from a new passkey, so
  // there is no password field. The biometric ceremony is held behind a loading
  // screen so the freshly derived recovery phrase is never revealed underneath
  // the OS prompt.
  const createPasskeyWallet = useCallback(async () => {
    setEnrolling(true);
    try {
      const outcome = await passkey.createPasskeyWallet(passkeyName());
      if (!outcome) {
        // Surfaced via passkey.error.
        return;
      }

      writeWalletKind(form.dataDir, "passkey");
      writePasskeyCredentialId(form.dataDir, outcome.credentialId);
      setKindVersion((v) => v + 1);

      // A freshly created passkey wallet returns a mnemonic to back up; an
      // imported one (opened from another device) does not, so skip the backup.
      setMnemonic(outcome.result.mnemonic);
      setBackupAcknowledged(outcome.result.mnemonic.length === 0);
    } finally {
      setEnrolling(false);
    }
  }, [passkey, wallet, form.dataDir]);

  // createWallet dispatches the create flow by the mode chosen on the create
  // screen: a passkey wallet (seed + DB password derived from a passkey) or a
  // password wallet (classic user-chosen password).
  const createWallet = useCallback(
    ({ password, mode }: { password: string; mode: "passkey" | "password" }) => {
      if (mode === "passkey") {
        void createPasskeyWallet();

        return;
      }

      void createPasswordWallet(password);
    },
    [createPasskeyWallet, createPasswordWallet],
  );

  const restoreWallet = useCallback(
    ({
      password,
      mnemonic: words,
      passphrase,
      recoverState,
      recoveryWindow,
    }: {
      password: string;
      mnemonic: string[];
      passphrase: string;
      recoverState: boolean;
      recoveryWindow?: number;
    }) => {
      // Fire-and-forget: restoreWallet lands us on the wallet as soon as it is
      // ready and runs recovery in the background (tracked via wallet.recovery),
      // so a long indexer scan no longer pins the user on the restore form.
      wallet.restoreWallet({
        password,
        mnemonic: words,
        seedPassphrase: passphrase || undefined,
        recoverState,
        recoveryWindow,
      });
      // A restore is a password wallet the user already holds the phrase for, so
      // record the kind and skip the backup screen optimistically. Guard the
      // localStorage write (it can throw under quota / private mode) so a
      // storage failure does not abort the rest of the restore transition; the
      // kind marker only influences which unlock affordance shows later.
      try {
        writeWalletKind(form.dataDir, "password");
        setKindVersion((v) => v + 1);
      } catch {
        // Non-fatal: proceed without the persisted wallet-kind marker.
      }
      setMnemonic([]);
      setBackupAcknowledged(true);
    },
    [wallet, form.dataDir],
  );

  const unlockWithPassword = useCallback(
    async (password: string) => {
      try {
        await wallet.unlockWallet({ password });
        writeWalletKind(form.dataDir, "password");
        setKindVersion((v) => v + 1);
        setBackupAcknowledged(true);
      } catch {
        // Surfaced via operations.unlockWallet.error.
      }
    },
    [wallet, form.dataDir],
  );

  // unlockWithPasskey opens an existing passkey wallet from a discoverable
  // passkey. It works on a fresh device (no local wrap). The seed and DB
  // password are re-derived from the passkey, and it is gated only on PRF
  // support. The ceremony + sync are held behind a loading screen.
  const unlockWithPasskey = useCallback(async () => {
    setUnlocking(true);
    try {
      const outcome = await passkey.openPasskeyWallet(
        readPasskeyCredentialId(form.dataDir) ?? undefined,
      );
      if (!outcome) {
        // Surfaced via passkey.error.
        return;
      }

      writeWalletKind(form.dataDir, "passkey");
      writePasskeyCredentialId(form.dataDir, outcome.credentialId);
      setKindVersion((v) => v + 1);
      setBackupAcknowledged(true);
    } finally {
      setUnlocking(false);
    }
  }, [passkey, wallet, form.dataDir]);

  // recoverWithPhrase tears the runtime down so the user can reconnect and
  // rebuild the wallet from a recovery phrase on the create/restore screen.
  const recoverWithPhrase = useCallback(async () => {
    try {
      await wallet.stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab("home");
    } catch {
      // Surfaced via operations.runtime.error.
    }
  }, [wallet]);

  const acknowledgeBackup = useCallback(async () => {
    setBackupAcknowledged(true);
    await wallet.refresh().catch(() => undefined);
  }, [wallet]);

  const stopRuntime = useCallback(async () => {
    try {
      await wallet.stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab("home");
    } catch {
      // Surfaced via operations.runtime.error.
    }
  }, [wallet]);

  const network = form.network;

  // Passkey enrollment in flight: hold on a loading screen so the freshly
  // generated recovery phrase stays hidden behind the biometric prompt.
  if (enrolling) {
    return (
      <LoadingScreen
        network={network}
        title="Creating wallet"
        sub="Generating keys and registering your passkey."
      />
    );
  }

  // Passkey unlock in flight: hold on a loading screen behind the biometric
  // prompt instead of leaving the unlock form visible underneath it.
  if (unlocking) {
    return (
      <LoadingScreen
        network={network}
        title="Unlocking wallet"
        sub="Decrypting keys and syncing. This can take a few seconds."
      />
    );
  }

  switch (wallet.phase) {
  case "loading":
    return (
      <LoadingScreen
        network={network}
        title="Starting WalletDK"
        sub="Downloading and instantiating the WASM runtime."
      />
    );

  case "starting":
    // The provider leaves the phase on 'starting' if start() rejects, so
    // surface the error with a retry instead of an endless spinner.
    return (
      <LoadingScreen
        network={network}
        title="Starting runtime"
        sub="Connecting to the gateways."
        error={wallet.operations.runtime.error}
        onRetry={startRuntime}
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
        busy={wallet.operations.runtime.busy}
        error={wallet.operations.runtime.error || wallet.error}
      />
    );

  case "needsWallet":
    return (
      <OnboardingFlow
        network={network}
        dataDir={form.dataDir}
        passkeySupported={passkey.supported}
        onCreate={createWallet}
        onRestore={restoreWallet}
        onUnlockPasskey={unlockWithPasskey}
        busy={wallet.operations.createWallet.busy}
        error={wallet.operations.createWallet.error}
        passkeyBusy={passkey.busy}
        passkeyError={passkey.error}
      />
    );

  case "locked":
    return (
      <UnlockScreen
        network={network}
        passkeySupported={passkey.supported}
        walletKind={walletKind}
        onUnlock={unlockWithPassword}
        onUnlockPasskey={unlockWithPasskey}
        onRecover={recoverWithPhrase}
        busy={wallet.operations.unlockWallet.busy}
        error={wallet.operations.unlockWallet.error}
        passkeyBusy={passkey.busy}
        passkeyError={passkey.error}
      />
    );

  case "syncing":
    return (
      <SyncingScreen
        network={network}
        blockHeight={wallet.info?.blockHeight}
        logs={logs}
      />
    );

  case "stopped":
    return (
      <StoppedScreen
        network={network}
        onStart={startRuntime}
        busy={wallet.operations.runtime.busy}
        blockHeight={wallet.info?.blockHeight}
        version={wallet.info?.version}
      />
    );

  case "error":
    return (
      <ErrorScreen
        network={network}
        message={wallet.error || wallet.operations.runtime.error}
        onRetry={startRuntime}
        busy={wallet.operations.runtime.busy}
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
        busy={wallet.operations.refresh.busy}
      />
    );
  }

  return (
    <AppShell
      tab={tab}
      onTab={setTab}
      onStop={stopRuntime}
      status={{
        phaseLabel,
        network: wallet.info?.network || network,
        connected: phaseConnected(wallet.phase),
        identityPubKey: wallet.info?.identityPubKey || "",
      }}
    >
      <RecoveryBanner
        recovery={wallet.recovery}
        onDismiss={wallet.acknowledgeRecovery}
      />
      {tab === "home" ? (
        <HomeScreen
          balance={wallet.balance}
          activity={wallet.activity}
          info={wallet.info}
          phaseLabel={phaseLabel}
          onNavigate={setTab}
          onDeposit={() => wallet.deposit().then((r) => r.address)}
          onRefresh={onManualRefresh}
          refreshBusy={manualRefreshing}
          depositBusy={wallet.operations.deposit.busy}
          depositError={wallet.operations.deposit.error}
        />
      ) : null}
      {tab === "receive" ? (
        <ReceiveScreen
          onNavigate={setTab}
          onReceive={wallet.receive}
          onDeposit={() => wallet.deposit()}
          activity={wallet.activity}
          balance={wallet.balance}
          receiveBusy={wallet.operations.receive.busy}
          receiveError={wallet.operations.receive.error}
          depositBusy={wallet.operations.deposit.busy}
          depositError={wallet.operations.deposit.error}
        />
      ) : null}
      {tab === "send" ? (
        <SendScreen
          onNavigate={setTab}
          onPrepare={wallet.prepareSend}
          onSendPrepared={wallet.sendPrepared}
          balanceSat={balanceSat(wallet.balance)}
          busy={wallet.operations.send.busy}
        />
      ) : null}
      {tab === "activity" ? (
        <ActivityScreen
          activity={wallet.activity}
          onNavigate={setTab}
          onRefresh={onManualRefresh}
          busy={manualRefreshing}
        />
      ) : null}
      {tab === "settings" ? (
        <SettingsScreen
          info={wallet.info}
          phaseLabel={phaseLabel}
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
