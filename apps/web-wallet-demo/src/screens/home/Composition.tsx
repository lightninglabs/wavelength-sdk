import { Balance } from "@lightninglabs/wavelength-react";
import {
  ALWAYS_SHOWN_BUCKETS,
  BUCKET_TONE,
  compositionBuckets,
} from "../../lib/balance";
import { formatSats, pct } from "../../lib/format";

// Composition is the balance-composition graph: a hairline segmented meter over
// a grid, sourced solely from the wavewalletrpc Balance snapshot. It renders one
// bucket per Balance field, hiding the credit buckets until the wallet holds
// credit. The grid tracks the bucket count, so the usual view is three columns
// and the credit rails widen it rather than wrapping under a fixed three.
export function Composition({ balance }: { balance: Balance | null }) {
  const buckets = compositionBuckets(balance);
  const total = buckets.reduce((sum, b) => sum + b.sat, 0) || 1;
  const shown = buckets.filter(
    (b) => b.sat > 0 || ALWAYS_SHOWN_BUCKETS.includes(b.key),
  );

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border">
        {shown.map((b) =>
          b.sat > 0 ? (
            <div
              key={b.key}
              style={{
                width: `${pct(b.sat, total)}%`,
                background: BUCKET_TONE[b.key],
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-4">
        {shown.map((b) => (
          <div key={b.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: BUCKET_TONE[b.key] }}
                />
                {b.label}
              </span>
              <span className="font-mono tabular-nums text-fg">
                {formatSats(b.sat)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct(b.sat, total)}%`,
                  background: BUCKET_TONE[b.key],
                }}
              />
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-faint">
              {pct(b.sat, total).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
