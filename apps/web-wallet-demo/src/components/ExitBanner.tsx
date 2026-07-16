import { ChevronRight, LogOut } from "lucide-react";
import { useWalletExits } from "@lightninglabs/wavelength-react";
import type { AppTab } from "./layout/nav";
import { formatSats } from "../lib/format";

// ExitBanner surfaces in-progress exits above the wallet UI, mirroring the
// RecoveryBanner's full-bleed bar. A unilateral exit runs for hours or days,
// so the bar persists as an always-visible way back into the exit screen while
// any exit is still settling. It renders nothing when no exit is in flight.
export function ExitBanner({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { summary } = useWalletExits();
  if (!summary || summary.totalExits === 0) {
    return null;
  }

  const plural = summary.totalExits > 1 ? "s" : "";

  return (
    <button
      type="button"
      data-testid="exit-banner"
      onClick={() => onNavigate("exit")}
      className="group flex w-full items-center gap-3 border-b border-border
        bg-accent-soft px-4 py-3 text-left text-sm text-fg transition-colors
        hover:[background:color-mix(in_srgb,var(--accent)_20%,transparent)]
        lg:px-8"
    >
      <LogOut size={16} className="shrink-0 text-accent" />
      <span className="flex-1">
        <span className="font-medium">
          {summary.totalExits} exit{plural} in progress
        </span>
        <span className="text-muted">
          {" · "}
          {formatSats(summary.totalEstNetRecoveredSat)} sats recovering
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
        Track
        <ChevronRight
          size={14}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </button>
  );
}
