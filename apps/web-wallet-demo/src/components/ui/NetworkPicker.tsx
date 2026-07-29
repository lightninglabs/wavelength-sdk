import { cn } from "../../lib/cn";
import type { RuntimeNetwork } from "../../lib/runtime-config";

// Each network carries one hue from the five-square brand cluster (BrandMark)
// plus a one-line descriptor of where its servers live, so the picker reads
// as part of the Wavelength lockup rather than a bare pill row.
const NETWORK_META: Record<
  RuntimeNetwork,
  { tone: string; blurb: string }
> = {
  signet: { tone: "bg-violet-fill", blurb: "Recommended for trying the demo" },
  testnet: { tone: "bg-sky-fill", blurb: "The public Bitcoin testnet3" },
  regtest: { tone: "bg-orange-fill", blurb: "Your local dev stack" },
};

// NetworkPicker is the network selector on the create/restore and legacy
// choose-network screens: one tile per network, in the same card idiom as
// WalletTypePicker (accent inset ring plus radio dot when selected). The
// accessible name is pinned to the bare network value with aria-label because
// the smoke tests select by it; the visible label is capitalized separately.
export function NetworkPicker({
  value,
  options,
  onChange,
}: {
  value: RuntimeNetwork;
  options: ReadonlyArray<RuntimeNetwork>;
  onChange: (next: RuntimeNetwork) => void;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))" }}
    >
      {options.map((network) => {
        const selected = value === network;
        const meta = NETWORK_META[network];

        return (
          <button
            key={network}
            type="button"
            aria-label={network}
            aria-pressed={selected}
            onClick={() => onChange(network)}
            className={cn(
              `group relative flex flex-col items-start gap-2.5 border
              px-3.5 py-3 text-left transition-all duration-200`,
              selected
                ? "border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]"
                : "border-border bg-surface-alt hover:border-border-strong hover:bg-surface",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-[1.5px] transition-transform duration-200",
                "group-hover:scale-125",
                meta.tone,
              )}
            />

            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm font-semibold capitalize tracking-tight",
                  selected ? "text-fg" : "text-fg/90",
                )}
              >
                {network}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                {meta.blurb}
              </span>
            </span>

            <span
              aria-hidden
              className={cn(
                "absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 transition-colors",
                selected
                  ? "border-accent bg-accent"
                  : "border-border-strong bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
