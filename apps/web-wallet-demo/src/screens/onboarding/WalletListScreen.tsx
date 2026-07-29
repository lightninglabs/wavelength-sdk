import { useState } from "react";
import { Fingerprint, KeyRound, Plus, Wallet, X } from "lucide-react";
import type { WalletEntry } from "../../lib/walletRegistry";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { WipeDataButton } from "../../components/WipeDataButton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { PrimaryButton, TextLink } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

// relativeTime renders a millisecond epoch as a short "last used" line. It
// only needs coarse buckets (this is a device-local list, not an audit log),
// so it steps through unit widths rather than pulling in Intl.RelativeTimeFormat.
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) {
    return "just now";
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

// WalletListScreen serves as the app's front door whenever more than zero
// wallets are registered: it never runs the daemon (the registry is plain
// localStorage), so it can render before any network round trip.
export function WalletListScreen({
  wallets,
  onOpen,
  onCreate,
  onRestore,
  onRemove,
  busy,
}: {
  wallets: WalletEntry[];
  onOpen: (entry: WalletEntry) => void;
  onCreate: () => void;
  onRestore: () => void;
  onRemove: (entry: WalletEntry) => void;
  busy: boolean;
}) {
  const [removing, setRemoving] = useState<WalletEntry | null>(null);

  return (
    <AuthLayout network="wallets" wide footer={<WipeDataButton />}>
      <AuthHeader
        title="Your wallets"
        sub="Every wallet lives in this browser only. Pick one to unlock, or add another."
      />

      {wallets.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {wallets.map((entry) => {
            const KindIcon =
              entry.walletKind === "passkey"
                ? Fingerprint
                : entry.walletKind === "password"
                  ? KeyRound
                  : Wallet;

            return (
              <li
                key={entry.id}
                className="group relative flex items-center gap-3 border
                  border-border bg-surface-alt transition-colors
                  hover:border-border-strong"
              >
                <button
                  type="button"
                  aria-label={entry.name}
                  onClick={() => onOpen(entry)}
                  disabled={busy}
                  className="flex flex-1 items-center gap-3 px-4 py-3 text-left
                    disabled:opacity-50"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center
                      justify-center border border-border bg-well text-muted"
                  >
                    <KindIcon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-fg">
                        {entry.name}
                      </span>
                      {entry.walletKind === null ? (
                        <span
                          className="shrink-0 border border-warn/40 bg-warn/10
                            px-1.5 py-0.5 text-[10px] font-medium uppercase
                            tracking-wide text-warn"
                        >
                          unfinished
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      <span className="border border-border px-1.5 py-0.5 uppercase tracking-wide">
                        {entry.network ?? "choose network"}
                      </span>
                      <span>{relativeTime(entry.lastUsedAt)}</span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(entry)}
                  disabled={busy}
                  className={cn(
                    `mr-3 flex shrink-0 items-center gap-1 px-2 py-1 text-xs
                    text-faint opacity-0 transition-opacity
                    hover:text-bad disabled:opacity-0`,
                    "group-hover:opacity-100 group-focus-within:opacity-100",
                  )}
                >
                  <X size={13} />
                  Remove from list
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="space-y-3">
        <PrimaryButton icon={Plus} onClick={onCreate} disabled={busy}>
          Create new wallet
        </PrimaryButton>
        <div className="text-center text-sm text-muted">
          <TextLink onClick={onRestore}>Restore a wallet</TextLink>
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this wallet?"
        description="This removes the wallet from this list only. Its data stays in this browser's storage until you use Clear all data below."
        confirmLabel="Remove wallet"
        destructive
        onConfirm={() => {
          if (removing) {
            onRemove(removing);
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </AuthLayout>
  );
}
