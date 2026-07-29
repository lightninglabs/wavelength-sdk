import { useState } from "react";
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import { PrimaryButton, TextLink } from "../../components/ui/Button";
import {
  WalletMode,
  WalletTypePicker,
} from "../../components/ui/WalletTypePicker";

// CreateWalletScreen creates a fresh wallet (a passkey wallet or a password
// wallet) for this registry entry. Restoring an existing wallet is a
// separate entry point, chosen from the wallet list before the runtime
// starts, so this screen only ever creates.
export function CreateWalletScreen({
  network,
  passkeySupported,
  onCreate,
  onBack,
  busy,
  error,
  passkeyBusy,
  passkeyError,
  restoreFailure,
  onDismissRestoreFailure,
}: {
  network: string;
  passkeySupported: boolean;
  onCreate: (args: { password: string; mode: WalletMode }) => void;
  /** Stops the runtime and returns to the wallet list. */
  onBack: () => void;
  busy: boolean;
  error: string;
  passkeyBusy: boolean;
  passkeyError: string;
  /** A restore that failed before the wallet came up, or empty when none. */
  restoreFailure?: string;
  /** Dismisses the restore-failure message. */
  onDismissRestoreFailure?: () => void;
}) {
  // Default to a passkey wallet when supported; otherwise password is the only
  // option.
  const [walletMode, setWalletMode] = useState<WalletMode>(
    passkeySupported ? "passkey" : "password",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // A passkey wallet derives its DB password, so the password fields are hidden
  // and do not gate submission.
  const passkeyCreate = walletMode === "passkey";
  const passwordOk = password.length > 0 && password === confirm;
  const anyBusy = busy || passkeyBusy;
  const canSubmit = passkeyCreate ? !anyBusy : !anyBusy && passwordOk;

  // submit validates canSubmit and creates the wallet in the selected mode.
  function submit() {
    if (!canSubmit) {
      return;
    }

    onCreate({ password, mode: walletMode });
  }

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Create wallet"
        sub="Keys are generated and stored on this device."
      />

      {passkeySupported ? (
        <div className="mb-6">
          <div className="mb-3">
            <div className="text-sm font-semibold text-fg">
              How do you want to secure this wallet?
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Pick one. You can always restore from your recovery phrase later.
            </p>
          </div>
          <WalletTypePicker value={walletMode} onChange={setWalletMode} />
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!passkeyCreate ? (
          <>
            <Field
              label="Password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="Confirm password"
              type="password"
              placeholder="••••••••••"
              value={confirm}
              onChange={setConfirm}
            />
          </>
        ) : null}

        <PrimaryButton
          type="submit"
          icon={passkeyCreate ? Fingerprint : KeyRound}
          disabled={!canSubmit}
        >
          {busy
            ? "Creating wallet…"
            : passkeyCreate
              ? "Create passkey wallet"
              : "Create wallet"}
        </PrimaryButton>
        <InlineError message={error} />
        <InlineError message={passkeyError} />

        <div className="flex items-center gap-2 text-xs text-faint">
          <ShieldCheck size={13} className="text-good" />
          On-device keys · nothing leaves this browser.
        </div>
      </form>

      {restoreFailure ? (
        <div className="mt-6 border-t border-border pt-5">
          <InlineError message={restoreFailure} />
          <button
            type="button"
            onClick={onDismissRestoreFailure}
            className="mt-1 text-xs font-medium text-muted hover:text-fg"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Suppressed while a create is in flight so the runtime is never torn
          down underneath a mid-flight daemon call. */}
      {!anyBusy ? (
        <div className="mt-5 text-center text-sm">
          <TextLink onClick={onBack}>Back to wallets</TextLink>
        </div>
      ) : null}
    </AuthLayout>
  );
}
