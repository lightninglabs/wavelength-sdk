import type { ExitJobStatus } from "@lightninglabs/wavelength-react";
import { cn } from "../../lib/cn";

// LABELS maps each job phase to its short wallet-facing label.
const LABELS: Record<ExitJobStatus, string> = {
  unspecified: "Unknown",
  pending: "Pending",
  materializing: "Materializing",
  csv_pending: "Timelock",
  sweeping: "Sweeping",
  completed: "Completed",
  failed: "Failed",
};

// TONE maps each phase to a semantic colour treatment. The four in-flight
// phases share the accent tone (work is happening), a finished exit reads
// "good", a failed one "bad", and an unknown phase stays neutral.
const TONE: Record<ExitJobStatus, string> = {
  unspecified: "border-border bg-well text-muted",
  pending: "border-transparent bg-accent-soft text-accent",
  materializing: "border-transparent bg-accent-soft text-accent",
  csv_pending: "border-transparent bg-accent-soft text-accent",
  sweeping: "border-transparent bg-accent-soft text-accent",
  completed:
    "border-transparent [background:color-mix(in_srgb,var(--good)_14%,transparent)] text-good",
  failed:
    "border-transparent [background:color-mix(in_srgb,var(--bad)_14%,transparent)] text-bad",
};

// IN_FLIGHT phases animate their status dot so an in-progress exit reads as
// live at a glance.
const IN_FLIGHT: ReadonlySet<ExitJobStatus> = new Set([
  "pending",
  "materializing",
  "csv_pending",
  "sweeping",
]);

// PhaseChip renders an exit's job phase as a compact status pill, deriving its
// tone from the phase. `detail` (the daemon's one-line phase description) is
// surfaced as a native tooltip.
export function PhaseChip({
  status,
  detail,
}: {
  status: ExitJobStatus;
  detail?: string;
}) {
  return (
    <span
      data-testid="exit-phase-chip"
      title={detail}
      className={cn(
        `inline-flex items-center gap-1.5 border px-2 py-1 text-[10px]
        font-semibold uppercase tracking-[0.1em]`,
        TONE[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          IN_FLIGHT.has(status) && "animate-pulse",
        )}
      />
      {LABELS[status]}
    </span>
  );
}
