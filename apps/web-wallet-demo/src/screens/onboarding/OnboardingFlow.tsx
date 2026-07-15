import { useState } from "react";
import {
  useWalletCreate,
  useWalletPasskey,
  useWalletRecovery,
  useWalletRestore,
} from "@lightninglabs/wavelength-react";
import type { WalletKind } from "@lightninglabs/wavelength-react";
import { webPasskeyCeremony } from "@lightninglabs/wavelength-web";
import { CreateWalletScreen } from "./CreateWalletScreen";
import { LoadingScreen } from "./LoadingScreen";
import { RestoreWalletScreen } from "./RestoreWalletScreen";
import {
  readPasskeyCredentialId,
  readWalletKind,
} from "../../lib/walletKind";

type Step = "create" | "restore";

const APP_NAME = "Wavelength Demo";

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

// OnboardingFlow serves the needsWallet phase (runtime started, no local
// wallet). It routes between creating a wallet and restoring one from a
// phrase, self-serving the create/restore/passkey verbs and reporting the
// outcome to the caller through session callbacks. The passkey ceremony is
// held behind a loading screen so a freshly derived recovery phrase is never
// revealed underneath the OS prompt.
export function OnboardingFlow({
  network,
  dataDir,
  onWalletCreated,
  onRestoreStarted,
  onWalletUnlocked,
}: {
  network: string;
  dataDir: string;
  onWalletCreated: (
    mnemonic: string[],
    kind: WalletKind,
    credentialId?: string,
  ) => void;
  onRestoreStarted: () => void;
  onWalletUnlocked: (kind: WalletKind, credentialId?: string) => void;
}) {
  const [step, setStep] = useState<Step>("create");
  const { create, createPending, createError } = useWalletCreate();
  const { restore, restorePending, restoreError } = useWalletRestore();
  const passkey = useWalletPasskey(webPasskeyCeremony);
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
    recovery.status === "failed" && !recovery.walletUsable
      ? recovery.error.message
      : "";

  // A recorded passkey credential id (or a passkey wallet-kind marker) for this
  // data dir means a passkey wallet lived here before (e.g. OPFS was cleared but
  // localStorage survived); lead with unlock so the user re-opens it rather than
  // minting a second wallet.
  const leadWithUnlock =
    passkey.supported &&
    (readPasskeyCredentialId(dataDir) !== null ||
      readWalletKind(dataDir) === "passkey");

  // The create-wallet and restore-wallet screens are mutually exclusive steps
  // of the same onboarding flow, so they share one combined busy/error surface
  // (the two daemon calls share the same underlying createWallet RPC).
  const onboardingBusy = createPending || restorePending;
  const onboardingErrorObj = createError ?? restoreError;
  const onboardingError = onboardingErrorObj?.message ?? "";

  // Passkey creation and unlock share one busy/error surface, matching the
  // daemon operation they both drive underneath (the passkey ceremony plus an
  // open-wallet call).
  const passkeyBusy = passkey.createPending || passkey.openPending;
  const passkeyErrorObj = passkey.createError ?? passkey.openError;
  const passkeyError = passkeyErrorObj?.message ?? "";

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
    // Outside the try: a throwing localStorage write in onWalletCreated must
    // not be swallowed by the create's own catch and silently skip the
    // backup screen.
    onWalletCreated(result.mnemonic || [], "password");
  }

  // createPasskeyWallet derives the seed and DB password from a new passkey,
  // so there is no password field.
  async function createPasskeyWallet() {
    let outcome;
    try {
      outcome = await passkey.create(passkeyName());
    } catch {
      // Surfaced via passkey.createError.
      return;
    }

    // Outside the try: a throwing localStorage write in onWalletCreated must
    // not be swallowed by the passkey ceremony's own catch and silently skip
    // the backup screen.
    //
    // The daemon returns a mnemonic when a new local wallet is created from
    // the derived seed, including importing a passkey wallet from another
    // device. Unlocking an existing wallet on this device returns none, so
    // backup is skipped only then. A null slice from the wire is coerced to
    // an empty array so the length check never throws.
    const words = outcome.result.mnemonic ?? [];
    onWalletCreated(words, "passkey", outcome.credentialId);
  }

  // onCreate dispatches the create flow by the mode chosen on the create
  // screen: a passkey wallet (seed + DB password derived from a passkey) or a
  // password wallet (classic user-chosen password).
  function onCreate({
    password,
    mode,
  }: {
    password: string;
    mode: "passkey" | "password";
  }) {
    if (mode === "passkey") {
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

  // onUnlockPasskey opens an existing passkey wallet from a discoverable
  // passkey. It works on a fresh device (no local wrap). The seed and DB
  // password are re-derived from the passkey, and it is gated only on PRF
  // support.
  async function onUnlockPasskey() {
    let outcome;
    try {
      outcome = await passkey.open(readPasskeyCredentialId(dataDir) ?? undefined);
    } catch {
      // Surfaced via passkey.openError.
      return;
    }
    // Outside the try: a throwing localStorage write in onWalletUnlocked
    // must not be swallowed by the passkey ceremony's own catch.
    onWalletUnlocked("passkey", outcome.credentialId);
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

  if (step === "restore") {
    return (
      <RestoreWalletScreen
        network={network}
        onRestore={onRestore}
        onBack={() => setStep("create")}
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
      onRestore={() => setStep("restore")}
      busy={onboardingBusy}
      error={onboardingError}
      passkeyBusy={passkeyBusy}
      passkeyError={passkeyError}
      restoreFailure={restoreFailure}
      onDismissRestoreFailure={acknowledgeRecovery}
    />
  );
}
