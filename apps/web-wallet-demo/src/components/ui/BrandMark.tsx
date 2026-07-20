import { cn } from "../../lib/cn";

// The five accent squares are the docs site's brand cluster; the order matches
// the docs header (violet, teal, lime, orange, sky).
const CLUSTER = ["bg-violet", "bg-teal", "bg-lime", "bg-orange", "bg-sky"];

// BrandMark renders the stacked Wavelength lockup: the docs-style two-tone
// wordmark over the five-square cluster, with a small lowercase demo tag
// right-aligned on the cluster's line. Stacking keeps the top bar narrow
// while carrying the full brand. The wordmark takes the bright brand teal
// rather than the darkened text value: WCAG exempts brand names from the
// contrast minimum, and matching the docs header exactly is the point.
export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className="inline-flex flex-col gap-1 self-start">
      <span
        className={cn(
          "font-display font-semibold leading-none text-fg",
          size === "sm" ? "text-sm" : "text-[15px]",
        )}
      >
        Wave<span className="text-teal-fill">length</span>
      </span>
      <span className="flex items-baseline justify-between">
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          {CLUSTER.map((tone) => (
            <span
              key={tone}
              className={cn(
                "rounded-[1.5px]",
                size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5",
                tone,
              )}
            />
          ))}
        </span>
        <span className="font-mono text-[10px] leading-none text-faint">
          demo
        </span>
      </span>
    </span>
  );
}
