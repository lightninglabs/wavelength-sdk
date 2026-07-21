import { useEffect } from "react";
import { Check } from "lucide-react";
import type { WalletVTXO } from "@lightninglabs/wavelength-react";
import { formatSats, shortKey } from "../../lib/format";
import { cn } from "../../lib/cn";
import { InlineError } from "../ui/InlineError";
import { Spinner } from "../ui/Spinner";

// VTXOPicker lists the wallet's VTXOs as a multi-select. The parent owns the
// inventory fetch (a single list({ view: 'vtxos' }) shared with the rest of
// the screen) and the selection, and passes the VTXOs in; this component only
// filters, renders, and reports the chosen outpoints upward. `excludeOutpoints`
// filters out VTXOs that already have an exit in progress, so the same outpoint
// cannot be queued for a second exit.
export function VTXOPicker({
  vtxos: inventory,
  pending,
  error,
  selected,
  onChange,
  excludeOutpoints = [],
}: {
  vtxos: readonly WalletVTXO[];
  pending: boolean;
  error: Error | null;
  selected: string[];
  onChange: (next: string[]) => void;
  excludeOutpoints?: string[];
}) {
  const vtxos: WalletVTXO[] = inventory.filter(
    (v) => !excludeOutpoints.includes(v.outpoint),
  );

  // Drop any already-selected outpoint that has since become excluded (e.g.
  // an exit started for it elsewhere) so it cannot remain queued.
  useEffect(() => {
    const next = selected.filter((o) => !excludeOutpoints.includes(o));
    if (next.length !== selected.length) {
      onChange(next);
    }
  }, [excludeOutpoints, selected, onChange]);

  const toggle = (outpoint: string) =>
    onChange(
      selected.includes(outpoint)
        ? selected.filter((o) => o !== outpoint)
        : [...selected, outpoint],
    );

  if (error) {
    return (
      <div data-testid="vtxo-picker" className="mt-4">
        <InlineError message={error.message} />
      </div>
    );
  }

  if (pending && vtxos.length === 0) {
    return (
      <div
        data-testid="vtxo-picker"
        className="mt-4 flex items-center gap-2.5 border border-border bg-well
          px-3 py-6 text-sm text-muted"
      >
        <Spinner size={15} className="shrink-0" />
        Loading your VTXOs…
      </div>
    );
  }

  if (vtxos.length === 0) {
    return (
      <div
        data-testid="vtxo-picker"
        className="mt-4 border border-dashed border-border bg-well px-3 py-8
          text-center text-sm text-muted"
      >
        No VTXOs to exit.
      </div>
    );
  }

  const total = vtxos
    .filter((v) => selected.includes(v.outpoint))
    .reduce((sum, v) => sum + v.amountSat, 0);

  return (
    <div data-testid="vtxo-picker" className="mt-4">
      <div className="divide-y divide-border border border-border">
        {vtxos.map((v) => {
          const on = selected.includes(v.outpoint);

          return (
            <button
              key={v.outpoint}
              type="button"
              data-testid="vtxo-row"
              aria-pressed={on}
              onClick={() => toggle(v.outpoint)}
              className={cn(
                `flex w-full items-center gap-3 px-3.5 py-3 text-left
                transition-colors`,
                on ? "bg-accent-soft" : "bg-surface hover:bg-well",
              )}
            >
              {/* Selection marker: a filled accent box when chosen, a hairline
                  outline when not, so the whole row reads as a checkbox. */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center border",
                  on
                    ? "border-accent-fill bg-accent-fill text-on-accent"
                    : "border-border-strong text-transparent",
                )}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono text-xs",
                  on ? "text-fg" : "text-muted",
                )}
              >
                {shortKey(v.outpoint)}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-fg">
                {formatSats(v.amountSat)}
                <span className="ml-1 text-[10px] font-medium text-faint">
                  sats
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {selected.length} of {vtxos.length} selected
        </span>
        {selected.length > 0 ? (
          <span className="font-mono tabular-nums text-fg">
            {formatSats(total)} sats
          </span>
        ) : null}
      </div>
    </div>
  );
}
