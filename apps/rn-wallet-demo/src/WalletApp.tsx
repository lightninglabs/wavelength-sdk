import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { usePasskeyWallet, useWalletDK } from '@lightninglabs/walletdk-react';
import {
  createNativePasskeyCeremony,
  getDefaultDataDir,
} from '@lightninglabs/walletdk-react-native';
import { AppShell } from './components/layout/AppShell';
import { RecoveryBanner } from './components/RecoveryBanner';
import { AppTab } from './components/layout/nav';
import { WalletMode } from './components/ui/WalletTypePicker';
import { balanceSat } from './lib/balance';
import { errorMessage } from './lib/errors';
import { phaseConnected, statusLabel } from './lib/phase';
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

const APP_NAME = 'WalletDK Demo';

// The demo's relying party: the docs site serves the association files that
// vouch for this app. Demo-grade trust; see the README.
const passkeyCeremony = createNativePasskeyCeremony({
  rpId: 'dadocs.lightning.engineering',
});

// WalletApp is the wallet orchestrator: it owns cross-screen session state
// (runtime form, recovery-phrase backup gating, passkey wiring, active tab)
// and routes to the correct screen by runtime phase. The data layer lives in
// WalletDKProvider; presentational screens receive values + handlers as
// props.
export function WalletApp() {
  const wallet = useWalletDK();
  const passkey = usePasskeyWallet(passkeyCeremony);
  const walletKind = useWalletKind();

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
  const [tab, setTab] = useState<AppTab>('home');
  const [enrolling, setEnrolling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // wiped keeps the post-wipe screen on Connect (the phase lands on
  // 'stopped', which otherwise renders the StoppedScreen); the next start
  // clears it.
  const [wiped, setWiped] = useState(false);

  const phaseLabel = statusLabel(wallet.phase);

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
      const info = await wallet.start({
        ...form,
        dataDir: form.dataDir || undefined,
      });
      setBackupAcknowledged(Boolean(info.walletReady));
    } catch {
      // Surfaced via operations.runtime.error / wallet.error.
    }
  }, [wallet, form]);

  // createPasswordWallet runs the classic password create path: it generates
  // a fresh seed, records the wallet kind, and reveals the recovery phrase on
  // the backup screen.
  const createPasswordWallet = useCallback(
    async (password: string) => {
      const result = await wallet.createWallet({ password }).catch(() => null);
      if (!result) {
        // Surfaced via operations.createWallet.error.
        return;
      }

      await walletKind.record('password');
      setMnemonic(result.mnemonic || []);
      setBackupAcknowledged(false);
    },
    [wallet, walletKind],
  );

  // createPasskeyWallet derives the seed and DB password from a new passkey.
  // The biometric ceremony is held behind a loading screen so the freshly
  // derived recovery phrase is never revealed underneath the OS prompt.
  const createPasskeyWallet = useCallback(async () => {
    setEnrolling(true);
    try {
      const outcome = await passkey.createPasskeyWallet(APP_NAME);
      if (!outcome) {
        // Surfaced via passkey.error.
        return;
      }

      await walletKind.record('passkey', outcome.credentialId);
      // The daemon returns a mnemonic whenever a new local wallet is created
      // from the derived seed, which includes importing a passkey wallet from
      // another device; unlocking a wallet that already exists on this device
      // returns none, so backup is skipped only then. A null slice from the
      // wire is coerced to an empty array so the length check never throws.
      const words = outcome.result.mnemonic ?? [];
      setMnemonic(words);
      setBackupAcknowledged(words.length === 0);
    } finally {
      setEnrolling(false);
    }
  }, [passkey, walletKind]);

  // createWallet dispatches the create flow by the mode chosen on the create
  // screen.
  const createWallet = useCallback(
    ({ password, mode }: { password: string; mode: WalletMode }) => {
      if (mode === 'passkey') {
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
      // record the kind and skip the backup screen optimistically. record is
      // async and fire-and-forget here, so swallow its rejection explicitly to
      // avoid an unhandled promise rejection.
      void walletKind.record('password').catch(() => undefined);
      setMnemonic([]);
      setBackupAcknowledged(true);
    },
    [wallet, walletKind],
  );

  const unlockWithPassword = useCallback(
    async (password: string) => {
      try {
        await wallet.unlockWallet({ password });
        await walletKind.record('password');
        setBackupAcknowledged(true);
      } catch {
        // Surfaced via operations.unlockWallet.error.
      }
    },
    [wallet, walletKind],
  );

  // unlockWithPasskey opens an existing passkey wallet, scoped to the stored
  // credential when one is known. The ceremony + sync are held behind a
  // loading screen.
  const unlockWithPasskey = useCallback(async () => {
    setUnlocking(true);
    try {
      const outcome = await passkey.openPasskeyWallet(
        walletKind.credentialId ?? undefined,
      );
      if (!outcome) {
        // Surfaced via passkey.error.
        return;
      }

      await walletKind.record('passkey', outcome.credentialId);
      setBackupAcknowledged(true);
    } finally {
      setUnlocking(false);
    }
  }, [passkey, walletKind]);

  // recoverWithPhrase tears the runtime down so the user can reconnect and
  // rebuild the wallet from a recovery phrase on the create/restore screen. It
  // clears any stale passkey error so a cancelled unlock does not carry over
  // to the create screen.
  const recoverWithPhrase = useCallback(async () => {
    passkey.clearError();
    try {
      await wallet.stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab('home');
    } catch {
      // Surfaced via operations.runtime.error.
    }
  }, [wallet, passkey]);

  const acknowledgeBackup = useCallback(async () => {
    setBackupAcknowledged(true);
    // Drop the recovery phrase from memory once acknowledged; it is never
    // shown again this session.
    setMnemonic([]);
    await wallet.refresh().catch(() => undefined);
  }, [wallet]);

  const stopRuntime = useCallback(async () => {
    try {
      await wallet.stop();
      setMnemonic([]);
      setBackupAcknowledged(false);
      setTab('home');
    } catch {
      // Surfaced via operations.runtime.error.
    }
  }, [wallet]);

  // wipeData stops the runtime (closing the daemon's SQLite handles), deletes
  // the data directory, clears the stored wallet markers, and resets the
  // session state. The theme preference survives by design. A failed deletion
  // must never look like a success: the confirmation dialog promises the data
  // is gone, so a failure surfaces an alert and leaves the wallet in place
  // rather than silently proceeding to the connect screen.
  const wipeData = useCallback(async () => {
    try {
      await wallet.stop();
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
  }, [wallet, form.dataDir, walletKind]);

  const network = form.network;

  // A recorded passkey wallet means the user should re-open it rather than
  // mint a second one, so onboarding leads with the unlock affordance.
  const leadWithUnlock =
    passkey.supported &&
    (walletKind.credentialId !== null || walletKind.kind === 'passkey');

  // Passkey ceremonies in flight hold on a loading screen (see the create and
  // unlock callbacks above).
  if (enrolling) {
    return (
      <LoadingScreen
        network={network}
        title="Creating wallet"
        sub="Generating keys and registering your passkey."
      />
    );
  }

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
    case 'loading':
      return (
        <LoadingScreen
          network={network}
          title="Starting WalletDK"
          sub="Initialising the embedded wallet runtime."
        />
      );

    case 'starting':
      // The provider leaves the phase on 'starting' if start() rejects, so
      // surface the error with a retry instead of an endless spinner.
      return (
        <LoadingScreen
          network={network}
          title="Starting runtime"
          sub="Connecting to the servers."
          error={wallet.operations.runtime.error}
          onRetry={() => void startRuntime()}
        />
      );

    case 'stopping':
      // Likewise, a rejected stop() leaves the phase on 'stopping'; offer a
      // retry rather than trapping the user on a spinner.
      return (
        <LoadingScreen
          network={network}
          title="Stopping runtime"
          sub="Tearing down the wallet."
          error={wallet.operations.runtime.error}
          onRetry={() => void stopRuntime()}
        />
      );

    case 'runtimeReady':
      return (
        <ConnectScreen
          form={form}
          onField={onField}
          onNetworkChange={onNetworkChange}
          onStart={() => void startRuntime()}
          busy={wallet.operations.runtime.busy}
          error={wallet.operations.runtime.error || wallet.error}
        />
      );

    case 'needsWallet':
      return (
        <OnboardingFlow
          network={network}
          passkeySupported={passkey.supported}
          leadWithUnlock={leadWithUnlock}
          onCreate={createWallet}
          onRestore={(args) => void restoreWallet(args)}
          onUnlockPasskey={() => void unlockWithPasskey()}
          busy={wallet.operations.createWallet.busy}
          error={wallet.operations.createWallet.error}
          passkeyBusy={passkey.busy}
          passkeyError={passkey.error}
        />
      );

    case 'locked':
      return (
        <UnlockScreen
          network={network}
          passkeySupported={passkey.supported}
          walletKind={walletKind.kind}
          onUnlock={(password) => void unlockWithPassword(password)}
          onUnlockPasskey={() => void unlockWithPasskey()}
          onRecover={() => void recoverWithPhrase()}
          onWipe={() => void wipeData()}
          busy={wallet.operations.unlockWallet.busy}
          error={wallet.operations.unlockWallet.error}
          passkeyBusy={passkey.busy}
          passkeyError={passkey.error}
        />
      );

    case 'syncing':
      return (
        <SyncingScreen
          network={network}
          blockHeight={wallet.info?.blockHeight}
          logs={wallet.logs}
        />
      );

    case 'stopped':
      if (wiped) {
        return (
          <ConnectScreen
            form={form}
            onField={onField}
            onNetworkChange={onNetworkChange}
            onStart={() => void startRuntime()}
            busy={wallet.operations.runtime.busy}
            error={wallet.operations.runtime.error || wallet.error}
          />
        );
      }

      return (
        <StoppedScreen
          network={network}
          onStart={() => void startRuntime()}
          busy={wallet.operations.runtime.busy}
          blockHeight={wallet.info?.blockHeight}
          version={wallet.info?.version}
        />
      );

    case 'error':
      return (
        <ErrorScreen
          network={network}
          message={wallet.error || wallet.operations.runtime.error}
          onRetry={() => void startRuntime()}
          busy={wallet.operations.runtime.busy}
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
        onAcknowledge={() => void acknowledgeBackup()}
        busy={wallet.operations.refresh.busy}
      />
    );
  }

  return (
    <AppShell
      tab={tab}
      onTab={setTab}
      status={{
        phaseLabel,
        network: wallet.info?.network || network,
        connected: phaseConnected(wallet.phase),
      }}
    >
      <RecoveryBanner
        recovery={wallet.recovery}
        onDismiss={wallet.acknowledgeRecovery}
      />
      {tab === 'home' ? (
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
      {tab === 'receive' ? (
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
      {tab === 'send' ? (
        <SendScreen
          onNavigate={setTab}
          onPrepare={wallet.prepareSend}
          onSendPrepared={wallet.sendPrepared}
          balanceSat={balanceSat(wallet.balance)}
          busy={wallet.operations.send.busy}
        />
      ) : null}
      {tab === 'activity' ? (
        <ActivityScreen
          activity={wallet.activity}
          onNavigate={setTab}
          onRefresh={onManualRefresh}
          busy={manualRefreshing}
        />
      ) : null}
      {tab === 'settings' ? (
        <SettingsScreen
          info={wallet.info}
          phaseLabel={phaseLabel}
          form={form}
          onField={onField}
          walletKind={walletKind.kind}
          onStop={() => void stopRuntime()}
          onWipe={() => void wipeData()}
          onNavigate={setTab}
        />
      ) : null}
    </AppShell>
  );
}
