import { useState } from 'react';
import {
  useWalletCreate,
  useWalletPasskey,
  useWalletRecovery,
  useWalletRestore,
} from '@lightninglabs/wavelength-react';
import type { WalletKind } from '@lightninglabs/wavelength-react';
import { passkeyCeremony } from '../../lib/passkeyCeremony';
import { WalletMode } from '../../components/ui/WalletTypePicker';
import { CreateWalletScreen } from './CreateWalletScreen';
import { LoadingScreen } from './LoadingScreen';
import { RestoreWalletScreen } from './RestoreWalletScreen';

type Step = 'create' | 'restore';

const APP_NAME = 'Wavelength Demo';

// OnboardingFlow serves the needsWallet phase (runtime started, no local
// wallet). It routes between creating a wallet and restoring one from a
// phrase, self-serving the create/restore/passkey verbs and reporting the
// outcome to the caller through session callbacks. walletKind and
// credentialId are the stored wallet markers (loaded by WalletApp): a
// recorded passkey wallet means the user should re-open it rather than mint
// a second one, so onboarding leads with the unlock affordance. The passkey
// ceremony is held behind a loading screen so a freshly derived recovery
// phrase is never revealed underneath the OS prompt.
export function OnboardingFlow({
  network,
  walletKind,
  credentialId,
  onWalletCreated,
  onRestoreStarted,
  onWalletUnlocked,
}: {
  network: string;
  walletKind: WalletKind | null;
  credentialId: string | null;
  onWalletCreated: (
    mnemonic: string[],
    kind: WalletKind,
    credentialId?: string,
  ) => void;
  onRestoreStarted: () => void;
  onWalletUnlocked: (kind: WalletKind, credentialId?: string) => void;
}) {
  const [step, setStep] = useState<Step>('create');
  const { create, createPending, createError } = useWalletCreate();
  const { restore, restorePending, restoreError } = useWalletRestore();
  // useWalletPasskey stays namespaced because its `create` verb would
  // otherwise collide with useWalletCreate's above.
  const passkey = useWalletPasskey(passkeyCeremony);
  const { recovery, acknowledge: acknowledgeRecovery } = useWalletRecovery();

  // Passkey support is still probing: hold on a loading screen rather than
  // flash a password-only form that would flip to passkey-first a moment
  // later. The probe is memoized and warmed at boot, so this rarely paints.
  if (passkey.supported === null) {
    return (
      <LoadingScreen
        network={network}
        title="Create wallet"
        sub="Checking device capabilities."
      />
    );
  }

  // A restore that fails before the wallet came up (walletUsable false)
  // falls the phase back to needsWallet, which unmounts the restoring-phase
  // screen and remounts this one, losing any local component state. The
  // engine keeps the failure in the snapshot (not hook-local state)
  // precisely so it survives that unmount and can be surfaced here once
  // onboarding is back on screen. A failure on an already-usable wallet
  // (walletUsable true) stays on the ready shell instead, so it never
  // reaches this component.
  const restoreFailure =
    recovery.status === 'failed' && !recovery.walletUsable
      ? recovery.error.message
      : '';

  const leadWithUnlock =
    passkey.supported && (credentialId !== null || walletKind === 'passkey');

  // The create-wallet and restore-wallet screens are mutually exclusive steps
  // of the same onboarding flow, so they share one combined busy/error surface
  // (the two daemon calls share the same underlying createWallet RPC).
  const onboardingBusy = createPending || restorePending;
  const onboardingError = (createError ?? restoreError)?.message ?? '';

  // Passkey creation and unlock share one busy/error surface, matching the
  // daemon operation they both drive underneath (the passkey ceremony plus an
  // open-wallet call).
  const passkeyBusy = passkey.createPending || passkey.openPending;
  const passkeyError = (passkey.createError ?? passkey.openError)?.message ?? '';

  // createPasswordWallet runs the classic password create path: it generates
  // a fresh seed and hands the recovery phrase to the caller to stage on the
  // backup screen.
  async function createPasswordWallet(password: string) {
    let result;
    try {
      result = await create({ password });
    } catch {
      // Surfaced via createError.
      return;
    }
    // Outside the try: a throwing AsyncStorage write in onWalletCreated must
    // not be swallowed by the create's own catch and silently skip the
    // backup screen.
    onWalletCreated(result.mnemonic ?? [], 'password');
  }

  // createPasskeyWallet derives the seed and DB password from a new passkey.
  async function createPasskeyWallet() {
    let outcome;
    try {
      outcome = await passkey.create(APP_NAME);
    } catch {
      // Surfaced via passkey.createError.
      return;
    }
    // Outside the try: a throwing AsyncStorage write in onWalletCreated must
    // not be swallowed by the passkey ceremony's own catch and silently skip
    // the backup screen.
    //
    // The daemon returns a mnemonic whenever a new local wallet is created
    // from the derived seed, which includes importing a passkey wallet from
    // another device; unlocking a wallet that already exists on this device
    // returns none, so backup is skipped only then. A null slice from the
    // wire is coerced to an empty array so the length check never throws.
    const words = outcome.result.mnemonic ?? [];
    onWalletCreated(words, 'passkey', outcome.credentialId);
  }

  // onCreate dispatches the create flow by the mode chosen on the create
  // screen.
  function onCreate({ password, mode }: { password: string; mode: WalletMode }) {
    if (mode === 'passkey') {
      void createPasskeyWallet();

      return;
    }

    void createPasswordWallet(password);
  }

  function onRestore(args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
    recoverState: boolean;
    recoveryWindow?: number;
  }) {
    // Fire-and-forget: restoreWallet lands us on the wallet as soon as it is
    // ready and runs recovery in the background (tracked via
    // useWalletRecovery), so a long indexer scan never pins the user on
    // the restore form.
    void restore({
      password: args.password,
      mnemonic: args.mnemonic,
      seedPassphrase: args.passphrase || undefined,
      recoverState: args.recoverState,
      recoveryWindow: args.recoveryWindow,
    }).catch(() => undefined);
    onRestoreStarted();
  }

  // onUnlockPasskey opens an existing passkey wallet, scoped to the stored
  // credential when one is known.
  async function onUnlockPasskey() {
    let outcome;
    try {
      outcome = await passkey.open(credentialId ?? undefined);
    } catch {
      // Surfaced via passkey.openError.
      return;
    }
    // Outside the try: a throwing AsyncStorage write in onWalletUnlocked
    // must not be swallowed by the passkey ceremony's own catch.
    onWalletUnlocked('passkey', outcome.credentialId);
  }

  // Passkey enrollment in flight: hold on a loading screen so the freshly
  // generated recovery phrase stays hidden behind the biometric prompt.
  if (passkey.createPending) {
    return (
      <LoadingScreen
        network={network}
        title="Creating wallet"
        sub="Generating keys and registering your passkey."
      />
    );
  }

  // Passkey unlock in flight (the lead-with-unlock affordance on this
  // screen): hold on a loading screen behind the biometric prompt instead of
  // leaving the form visible underneath it.
  if (passkey.openPending) {
    return (
      <LoadingScreen
        network={network}
        title="Unlocking wallet"
        sub="Decrypting keys and syncing. This can take a few seconds."
      />
    );
  }

  if (step === 'restore') {
    return (
      <RestoreWalletScreen
        network={network}
        onRestore={onRestore}
        onBack={() => setStep('create')}
        busy={onboardingBusy}
        error={onboardingError}
      />
    );
  }

  return (
    <CreateWalletScreen
      network={network}
      passkeySupported={passkey.supported}
      leadWithUnlock={leadWithUnlock}
      onCreate={onCreate}
      onUnlockPasskey={() => void onUnlockPasskey()}
      onRestore={() => setStep('restore')}
      busy={onboardingBusy}
      error={onboardingError}
      passkeyBusy={passkeyBusy}
      passkeyError={passkeyError}
      restoreFailure={restoreFailure}
      onDismissRestoreFailure={acknowledgeRecovery}
    />
  );
}
