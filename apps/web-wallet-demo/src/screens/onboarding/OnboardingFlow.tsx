import { useState } from "react";
import {
  useWalletCreate,
  useWalletEngine,
  useWalletPasskey,
  useWalletRecovery,
  useWalletRestore,
} from "@lightninglabs/wavelength-react";
import type { WalletKind } from "@lightninglabs/wavelength-react";
import { instrumentedPasskeyCeremony } from "../../lib/performance";
import { CreateWalletScreen } from "./CreateWalletScreen";
import { LoadingScreen } from "./LoadingScreen";
import { RestoreWalletScreen } from "./RestoreWalletScreen";
import { loadWallets } from "../../lib/walletRegistry";

// passkeyName labels a freshly created passkey with the wallet's user-chosen
// name plus a timestamp, so wallets stay distinguishable in the OS prompt.
function passkeyName(walletName: string): string {
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${walletName} · ${stamp}`;
}

// OnboardingFlow serves the needsWallet phase (runtime started, no local
// wallet) for a single registry entry, routed by the mode the wallet list
// chose for it: create a fresh wallet, or restore one from a phrase or
// passkey. It self-serves the create/restore/passkey verbs and reports the
// outcome to the caller through session callbacks. The passkey ceremony is
// held behind a loading screen so a freshly derived recovery phrase is never
// revealed underneath the OS prompt.
export function OnboardingFlow({
  network,
  mode,
  walletName,
  onWalletCreated,
  onWalletRestored,
  onWalletUnlocked,
  onBack,
}: {
  network: string;
  mode: "create" | "restore";
  walletName: string;
  onWalletCreated: (
    mnemonic: string[],
    kind: WalletKind,
    credentialId?: string,
  ) => void;
  /** Called once a phrase restore has brought the wallet up. */
  onWalletRestored: () => void;
  onWalletUnlocked: (kind: WalletKind, credentialId?: string) => void;
  /** Stops the runtime and returns to the wallet list. */
  onBack: () => void;
}) {
  const engine = useWalletEngine();
  const { create, createPending, createError } = useWalletCreate();
  const { restore, restorePending, restoreError } = useWalletRestore();
  const passkey = useWalletPasskey(instrumentedPasskeyCeremony);
  const { recovery, acknowledge: acknowledgeRecovery } = useWalletRecovery();

  // The passkey-restore affordance on the restore screen bypasses
  // useWalletPasskey.open (see onRestorePasskey below), so it tracks its own
  // busy/error state rather than sharing passkey.openPending/openError.
  const [restorePasskeyPending, setRestorePasskeyPending] = useState(false);
  const [restorePasskeyError, setRestorePasskeyError] = useState("");

  // Passkey support is still probing: hold on a loading screen rather than
  // flash a password-only form that would flip to passkey-first a moment
  // later. The probe is memoized and warmed at boot, so this rarely paints.
  if (passkey.supported === null) {
    return (
      <LoadingScreen
        network={network}
        title={mode === "create" ? "Create wallet" : "Restore wallet"}
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

  // The create-wallet and restore-wallet screens are mutually exclusive steps
  // of the same onboarding flow, so they share one combined busy/error surface
  // (the two daemon calls share the same underlying createWallet RPC).
  const onboardingBusy = createPending || restorePending;
  const onboardingErrorObj = createError ?? restoreError;
  const onboardingError = onboardingErrorObj?.message ?? "";

  // Passkey creation shares one busy/error surface with the ceremony, which
  // matches the daemon operation it drives underneath.
  const passkeyBusy = passkey.createPending;
  const passkeyError = passkey.createError?.message ?? "";

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
      outcome = await passkey.create(passkeyName(walletName));
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
    mode: createMode,
  }: {
    password: string;
    mode: "passkey" | "password";
  }) {
    if (createMode === "passkey") {
      void createPasskeyWallet();

      return;
    }

    void createPasswordWallet(password);
  }

  // restorePasswordWallet runs the phrase restore. restoreWallet resolves as
  // soon as the wallet is usable and runs any recovery scan in the background
  // (tracked via useWalletRecovery), so awaiting it never pins the user on
  // the restore form for the scan. The registry entry is stamped only after
  // that resolve: a restore that fails before the wallet comes up must leave
  // the entry unstamped, so the needsWallet fallback re-renders this restore
  // form (with the snapshot's preserved failure) instead of treating the
  // entry as an existing wallet whose data went missing.
  async function restorePasswordWallet(args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
    recoverState: boolean;
    recoveryWindow?: number;
  }) {
    try {
      await restore({
        password: args.password,
        mnemonic: args.mnemonic,
        seedPassphrase: args.passphrase || undefined,
        recoverState: args.recoverState,
        recoveryWindow: args.recoveryWindow,
      });
    } catch {
      // Surfaced via restoreError while this form is still mounted, and via
      // restoreFailure once the phase falls back and remounts it.
      return;
    }
    // Outside the try: a throwing localStorage write in onWalletRestored must
    // not be swallowed by the restore's own catch.
    onWalletRestored();
  }

  function onRestore(args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
    recoverState: boolean;
    recoveryWindow?: number;
  }) {
    void restorePasswordWallet(args);
  }

  // onRestorePasskey opens a wallet from a discoverable passkey that has
  // never been registered on this entry. It asserts the passkey itself
  // (rather than going through useWalletPasskey.open) so the registry can be
  // checked for a duplicate between the ceremony and the daemon import: a
  // passkey that already unlocks another entry should send the user back to
  // that entry instead of quietly minting a second wallet for it.
  async function onRestorePasskey() {
    setRestorePasskeyError("");
    let assertion;
    try {
      assertion = await instrumentedPasskeyCeremony.assertPasskeyPrf();
    } catch {
      setRestorePasskeyError("Passkey ceremony was cancelled or failed.");

      return;
    }

    const existing = loadWallets().find(
      (w) => w.credentialId === assertion.credentialId,
    );
    if (existing) {
      setRestorePasskeyError(
        `That passkey already unlocks "${existing.name}". Open it from the wallet list instead.`,
      );

      return;
    }

    setRestorePasskeyPending(true);
    try {
      await engine.openWalletFromPasskey({ prfOutput: assertion.prfOutput });
    } catch {
      setRestorePasskeyError("Could not open a wallet from that passkey.");
      setRestorePasskeyPending(false);

      return;
    }
    // Outside the try: a throwing localStorage write in onWalletUnlocked
    // must not be swallowed by the daemon call's own catch.
    onWalletUnlocked("passkey", assertion.credentialId);
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

  // Passkey restore in flight: hold on the same "unlocking" loading screen
  // used elsewhere while the ceremony and daemon import run.
  if (restorePasskeyPending) {
    return (
      <LoadingScreen
        network={network}
        title="Unlocking wallet"
        sub="Decrypting keys and opening your wallet."
      />
    );
  }

  if (mode === "restore") {
    return (
      <RestoreWalletScreen
        network={network}
        onRestore={onRestore}
        onBack={onBack}
        busy={onboardingBusy}
        error={onboardingError}
        onRestorePasskey={
          passkey.supported ? () => void onRestorePasskey() : undefined
        }
        passkeyBusy={restorePasskeyPending}
        passkeyError={restorePasskeyError}
        restoreFailure={restoreFailure}
        onDismissRestoreFailure={acknowledgeRecovery}
      />
    );
  }

  return (
    <CreateWalletScreen
      network={network}
      passkeySupported={passkey.supported}
      onCreate={onCreate}
      onBack={onBack}
      busy={onboardingBusy}
      error={onboardingError}
      passkeyBusy={passkeyBusy}
      passkeyError={passkeyError}
      restoreFailure={restoreFailure}
      onDismissRestoreFailure={acknowledgeRecovery}
    />
  );
}
