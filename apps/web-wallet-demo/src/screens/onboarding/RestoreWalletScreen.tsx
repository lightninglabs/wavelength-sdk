import { useState } from "react";
import { KeyRound } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import {
  GhostButton,
  PrimaryButton,
} from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { ToggleRow } from "../../components/ui/ToggleRow";

// resize grows or shrinks a word list to the requested length, preserving any
// already-entered words.
function resize(words: string[], length: number): string[] {
  const next = words.slice(0, length);
  while (next.length < length) {
    next.push("");
  }

  return next;
}

// parseMnemonicPaste splits clipboard text on whitespace (spaces, tabs,
// newlines) into individual recovery words.
function parseMnemonicPaste(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

// RestoreWalletScreen rebuilds a wallet on-device from an existing recovery
// phrase. Restores are always password wallets, so it collects a new local
// password alongside the phrase.
export function RestoreWalletScreen({
  network,
  onRestore,
  onBack,
  busy,
  error,
}: {
  network: string;
  onRestore: (args: {
    password: string;
    mnemonic: string[];
    passphrase: string;
    recoverState: boolean;
    recoveryWindow?: number;
  }) => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [count, setCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(() => resize([], 12));
  const [passphrase, setPassphrase] = useState("");
  // Restores default to recovery on: a mnemonic without it rebuilds the seed
  // but leaves the wallet empty, which is rarely what someone restoring wants.
  const [recoverState, setRecoverState] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recoveryWindow, setRecoveryWindow] = useState("");

  const passwordOk = password.length > 0 && password === confirm;
  const wordsOk = words.every((w) => w.trim().length > 0);
  // An empty window field means "let the daemon default"; only a present value
  // must parse to a positive integer.
  const windowOk =
    recoveryWindow.trim() === "" ||
    (/^\d+$/.test(recoveryWindow.trim()) && Number(recoveryWindow) > 0);
  const canSubmit = !busy && passwordOk && wordsOk && windowOk;

  // handleWordPaste distributes a multi-word clipboard string across the
  // recovery phrase inputs (e.g. paste all 24 words at once).
  function handleWordPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const parts = parseMnemonicPaste(e.clipboardData.getData("text"));
    if (parts.length <= 1) {
      return;
    }

    e.preventDefault();

    const length: 12 | 24 =
      parts.length === 12 ? 12 : parts.length === 24 ? 24 : count;

    if (length !== count) {
      setCount(length);
    }
    setWords(resize(parts, length));
  }

  // submit validates canSubmit and calls onRestore with trimmed words and
  // passphrase.
  function submit() {
    if (!canSubmit) {
      return;
    }

    const window = recoveryWindow.trim();
    onRestore({
      password,
      mnemonic: words.map((w) => w.trim()),
      passphrase: passphrase.trim(),
      recoverState,
      recoveryWindow: recoverState && window !== "" ? Number(window) : undefined,
    });
  }

  return (
    <AuthLayout network={network} wide>
      <AuthHeader
        title="Restore wallet"
        sub="Enter your recovery phrase to rebuild this wallet on-device."
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="New password"
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

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Recovery phrase
            </span>
            <Segmented
              size="sm"
              value={String(count)}
              onChange={(v) => {
                const n = Number(v) as 12 | 24;
                setCount(n);
                setWords((w) => resize(w, n));
              }}
              options={[
                { value: "12", label: "12 words" },
                { value: "24", label: "24 words" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {words.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-2 border border-border
                  bg-well px-2.5 py-1.5"
              >
                <span className="font-mono text-xs tabular-nums text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  className="w-full bg-transparent text-sm text-fg
                    outline-none"
                  aria-label={`Word ${i + 1}`}
                  value={word}
                  onChange={(e) =>
                    setWords((w) =>
                      w.map((x, idx) => (idx === i ? e.target.value : x)),
                    )
                  }
                  onPaste={handleWordPaste}
                />
              </div>
            ))}
          </div>
        </div>

        <Field
          label="BIP-39 passphrase (optional)"
          type="password"
          placeholder="leave blank if unused"
          value={passphrase}
          onChange={setPassphrase}
        />

        <div className="space-y-3 border border-border bg-well px-3 py-3">
          <ToggleRow
            title="Recover wallet state"
            subtitle="Rebuild balances and history from the operator's indexer.
              This scan can take a while."
            on={recoverState}
            onChange={setRecoverState}
            disabled={busy}
          />
          {recoverState && (
            <div className="space-y-3 border-t border-border pt-3">
              <button
                type="button"
                className="text-xs font-medium text-muted
                  hover:text-fg disabled:cursor-not-allowed"
                onClick={() => setShowAdvanced((v) => !v)}
                disabled={busy}
              >
                {showAdvanced ? "Hide advanced" : "Advanced"}
              </button>
              {showAdvanced && (
                <Field
                  label="Recovery window (optional)"
                  type="text"
                  inputMode="numeric"
                  mono
                  placeholder="daemon default"
                  value={recoveryWindow}
                  onChange={setRecoveryWindow}
                  disabled={busy}
                />
              )}
            </div>
          )}
        </div>

        <PrimaryButton type="submit" icon={KeyRound} disabled={!canSubmit}>
          {busy ? "Restoring wallet…" : "Restore wallet"}
        </PrimaryButton>
        <InlineError message={error} />
        <GhostButton onClick={onBack} disabled={busy}>
          Back
        </GhostButton>
      </form>
    </AuthLayout>
  );
}
