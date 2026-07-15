import { useState } from "react";
import { Fingerprint, KeyRound, RotateCcw } from "lucide-react";
import {
  useWalletPasskey,
  useWalletUnlock,
} from "@lightninglabs/wavelength-react";
import type { WalletKind } from "@lightninglabs/wavelength-react";
import { webPasskeyCeremony } from "@lightninglabs/wavelength-web";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import { GhostButton, PrimaryButton, TextLink } from "../../components/ui/Button";
import { requestWipe } from "../../lib/wipeLocalData";
import { readPasskeyCredentialId } from "../../lib/walletKind";
import { LoadingScreen } from "./LoadingScreen";

// UnlockScreen serves the `locked` phase: a wallet exists on this device and
// must be unlocked. A passkey wallet is unlocked with a platform authenticator
// (no local wrap needed, as the seed is re-derived from the passkey), while a
// password wallet uses its password. The passkey affordance is gated only on
// PRF support, so it remains available even on a device with no local marker.
// The passkey ceremony is held behind a loading screen so a synced wallet is
// never shown mid-biometric-prompt.
export function UnlockScreen({
  network,
  dataDir,
  walletKind,
  onWalletUnlocked,
  onRecover,
}: {
  network: string;
  dataDir: string;
  walletKind: WalletKind | null;
  onWalletUnlocked: (kind: WalletKind, credentialId?: string) => void;
  onRecover: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const { unlock, unlockPending, unlockError } = useWalletUnlock();
  const passkey = useWalletPasskey(webPasskeyCeremony);
  const anyBusy = unlockPending || passkey.openPending;

  // Passkey support is still probing: hold on a loading screen rather than
  // flash a password-only form that would flip to passkey-first a moment
  // later. The probe is memoized and warmed at boot, so this rarely paints.
  if (passkey.supported === null) {
    return (
      <LoadingScreen
        network={network}
        title="Unlock wallet"
        sub="Checking device capabilities."
      />
    );
  }

  // The passkey option does not depend on a locally stored wrap: it is offered
  // whenever the device supports PRF and the wallet is not explicitly a password
  // wallet (an unknown marker still permits a passkey attempt).
  const showPasskey = passkey.supported && walletKind !== "password";
  const showPassword = walletKind === "password" || (!showPasskey && walletKind === null);

  // The subtitle names only the methods actually offered, so a passkey wallet
  // (which has no password) is never told it can unlock with one.
  const sub =
    showPasskey && showPassword
      ? "Unlock with your passkey or password to sync the wallet."
      : showPasskey
        ? "Unlock with your passkey to sync the wallet."
        : showPassword
          ? "Unlock with your password to sync the wallet."
          : "Unlock to sync the wallet.";

  async function onUnlock(pw: string) {
    try {
      await unlock({ password: pw });
    } catch {
      // Surfaced via unlockError.
      return;
    }
    // Outside the try: a throwing localStorage write in onWalletUnlocked
    // must not be swallowed by unlock's own catch.
    onWalletUnlocked("password");
  }

  // onUnlockPasskey opens an existing passkey wallet, scoped to the stored
  // credential id when one is known. The seed and DB password are re-derived
  // from the passkey.
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

  // Passkey unlock in flight: hold on a loading screen behind the biometric
  // prompt instead of leaving the unlock form visible underneath it.
  if (passkey.openPending) {
    return (
      <LoadingScreen
        network={network}
        title="Unlocking wallet"
        sub="Decrypting keys and syncing. This can take a few seconds."
      />
    );
  }

  return (
    <AuthLayout network={network}>
      <AuthHeader title="Unlock wallet" sub={sub} />

      {showPasskey ? (
        <div className="mb-4 space-y-4">
          <GhostButton
            icon={Fingerprint}
            onClick={() => void onUnlockPasskey()}
            disabled={anyBusy}
          >
            Unlock with passkey
          </GhostButton>
          {showPassword ? (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-faint">or use password</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}
        </div>
      ) : null}

      {showPassword ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!anyBusy && password.length > 0) {
              void onUnlock(password);
            }
          }}
        >
          <Field
            label="Password"
            type="password"
            placeholder="••••••••••"
            value={password}
            onChange={setPassword}
          />
          <PrimaryButton
            type="submit"
            icon={KeyRound}
            busy={unlockPending}
            disabled={anyBusy || password.length === 0}
          >
            {unlockPending ? "Unlocking…" : "Unlock"}
          </PrimaryButton>

          {anyBusy ? (
            <p className="text-center text-xs text-muted">
              Decrypting keys and syncing. This can take a few seconds.
            </p>
          ) : null}
        </form>
      ) : null}

      <InlineError message={unlockError?.message || passkey.openError?.message || ""} />

      <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-faint">
        <RotateCcw size={13} />
        <span>Lost access?</span>
        <TextLink onClick={onRecover}>Recover with phrase</TextLink>
      </div>

      <div className="mt-2 text-center text-xs">
        <button
          type="button"
          onClick={() => setConfirmWipe(true)}
          className="text-faint underline underline-offset-2 transition-colors
            hover:text-muted"
        >
          Start over (clear all data)
        </button>
      </div>

      <ConfirmDialog
        open={confirmWipe}
        title="Clear wallet data?"
        description="This permanently deletes the wallet and all data stored in this browser. You will need your recovery phrase or passkey to restore your wallet. This cannot be undone."
        confirmLabel="Clear everything"
        destructive
        onConfirm={requestWipe}
        onCancel={() => setConfirmWipe(false)}
      />
    </AuthLayout>
  );
}
