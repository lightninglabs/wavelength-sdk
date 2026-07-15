import { RefreshCw } from "lucide-react";
import { useWalletExitStatus } from "@lightninglabs/wavelength-react";
import { formatSats } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PhaseChip } from "./PhaseChip";
import { SummaryRow } from "../ui/SummaryRow";
import { InlineError } from "../ui/InlineError";

// ExitStatusPanel shows one exit's live detail: its phase, recovery-tree
// progress, timelock countdown, fee/recovery breakdown, and any terminal
// error. It polls in the foreground so the numbers stay current while the
// screen is open.
export function ExitStatusPanel({ outpoint }: { outpoint: string }) {
  const { status, refreshStatus, statusPending } = useWalletExitStatus(outpoint, {
    detailed: true,
    pollMs: 15000,
  });

  if (!status?.found) {
    return (
      <p data-testid="exit-status-empty" className="mt-3 text-sm text-muted">
        No exit in progress.
      </p>
    );
  }

  return (
    <div
      data-testid="exit-status-panel"
      className="mt-3 border border-border bg-well px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <PhaseChip status={status.status} detail={status.phaseDetail} />
        <button
          type="button"
          onClick={() => void refreshStatus()}
          disabled={statusPending}
          className="inline-flex items-center gap-1.5 text-xs font-medium
            text-muted transition-colors hover:text-fg disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={cn(statusPending && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      <div className="mt-3.5 space-y-2.5 text-sm">
        {status.progress ? (
          <SummaryRow
            label="Recovery tree"
            value={`layer ${status.progress.currentLayer} of ${status.progress.totalLayers}, ${status.progress.confirmedTxs}/${status.progress.totalTxs} txs`}
          />
        ) : null}
        {status.cSV ? (
          <SummaryRow
            label="Timelock"
            value={
              status.cSV.mature
                ? "mature"
                : `${status.cSV.blocksRemaining} blocks left`
            }
          />
        ) : null}
        {status.fees ? (
          <>
            <SummaryRow
              label="Total cost"
              value={`${formatSats(status.fees.totalCostSat)} sats`}
              mono
            />
            <SummaryRow
              label="Net recovered"
              value={`${formatSats(status.fees.netRecoveredSat)} sats`}
              mono
            />
          </>
        ) : null}
      </div>

      {status.status === "failed" ? (
        <div className="mt-3.5">
          <InlineError message={status.lastError} />
        </div>
      ) : null}
    </div>
  );
}
