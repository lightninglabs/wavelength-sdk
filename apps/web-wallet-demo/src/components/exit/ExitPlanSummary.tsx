import { Info, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import {
  isExitInfeasibilityFundable,
  type ExitPlanEntry,
  type GetExitPlanResult,
} from "@lightninglabs/wavelength-react";
import { formatSats, shortKey } from "../../lib/format";
import { SummaryRow } from "../ui/SummaryRow";
import { CopyRow } from "../ui/CopyRow";

// ExitPlanSummary previews a unilateral exit: the aggregate funding the backing
// wallet needs, plus, for each outpoint that cannot start, either a fundable
// "top up this address" affordance or a terminal structural message. The
// Re-check control re-runs the plan; ExitScreen owns the plan and supplies it.
export function ExitPlanSummary({
  plan,
  onRecheck,
  recheckPending,
}: {
  plan: GetExitPlanResult;
  onRecheck: () => void;
  recheckPending: boolean;
}) {
  const blocked = plan.plans.filter((p) => !p.canStart);

  return (
    <div data-testid="exit-plan-summary" className="mt-4">
      <div className="space-y-2.5 border border-border bg-well px-4 py-3.5 text-sm">
        <SummaryRow
          label="Fee rate"
          value={`${plan.feeRateSatPerVByte} sat/vB`}
          mono
        />
        <SummaryRow
          label="Funding needed"
          value={`${formatSats(plan.totalRecommendedFundingSat)} sats`}
          mono
        />
        <SummaryRow
          label="Shortfall"
          value={`${formatSats(plan.totalFundingShortfallSat)} sats`}
          mono
        />
      </div>

      {blocked.length > 0 ? (
        <div className="mt-3 space-y-3">
          {blocked.map((p) =>
            isExitInfeasibilityFundable(p.infeasibilityReason) ? (
              <FundingBlock
                key={p.outpoint}
                entry={p}
                feeRateSatPerVByte={plan.feeRateSatPerVByte}
                onRecheck={onRecheck}
                recheckPending={recheckPending}
              />
            ) : (
              <p
                key={p.outpoint}
                data-testid="exit-structural"
                className="flex items-start gap-2 border border-bad/35 bg-bad/10
                  p-3 text-xs text-bad"
              >
                <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                <span className="break-words">
                  <span className="font-mono">{shortKey(p.outpoint)}</span>:
                  cannot be exited economically ({p.infeasibilityReason}).
                  {p.infeasibilityReason === "uneconomical" ? (
                    <>
                      {" "}
                      The recovery fee is more than the VTXO is worth at the
                      current fee rate; a larger VTXO or a lower fee rate makes
                      it economical.
                    </>
                  ) : null}
                </span>
              </p>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

// FundingBlock leads with how much to send and why, then the fundable address
// and a Re-check control, so a stuck tester knows the next concrete step.
function FundingBlock({
  entry,
  feeRateSatPerVByte,
  onRecheck,
  recheckPending,
}: {
  entry: ExitPlanEntry;
  feeRateSatPerVByte: number;
  onRecheck: () => void;
  recheckPending: boolean;
}) {
  const have = entry.recommendedTotalFundingSat - entry.fundingShortfallSat;
  const needsSplit = entry.requiredFeeUTXOCount > entry.usableFeeUTXOCount;

  return (
    <div className="border border-warn/35 bg-warn/10 p-3">
      <p className="flex items-start gap-2 text-xs font-semibold text-warn">
        <Wallet size={14} className="mt-0.5 shrink-0" />
        Your backing wallet needs on-chain funds
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A unilateral exit pays on-chain miner fees to force your VTXO out. Those
        fees come from your backing wallet, which is currently short.
      </p>
      <p className="mt-2.5 text-xs leading-relaxed text-fg">
        <span className="font-semibold">
          Send ~{formatSats(entry.fundingShortfallSat)} sats
        </span>{" "}
        to the address below, then <span className="font-semibold">Re-check</span>.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        <Info size={12} className="shrink-0" />
        Backing wallet has{" "}
        <span className="font-mono tabular-nums">{formatSats(have)}</span> of{" "}
        <span className="font-mono tabular-nums">
          {formatSats(entry.recommendedTotalFundingSat)}
        </span>{" "}
        sats needed - fee rate{" "}
        <span className="font-mono tabular-nums">{feeRateSatPerVByte}</span>{" "}
        sat/vB
      </p>
      {needsSplit ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          Send this across {entry.requiredFeeUTXOCount} separate payments so the
          wallet has enough fee inputs.
        </p>
      ) : null}
      <div className="mt-3">
        <CopyRow label="Funding address" value={entry.fundingAddress} />
      </div>
      <button
        type="button"
        data-testid="exit-recheck"
        onClick={onRecheck}
        disabled={recheckPending}
        className="mt-3 inline-flex items-center justify-center gap-2 border
          border-border bg-surface-alt px-4 py-2.5 text-sm font-medium text-fg
          transition-colors hover:border-border-strong disabled:opacity-50"
      >
        <RefreshCw
          size={16}
          className={recheckPending ? "animate-spin" : undefined}
        />
        {recheckPending ? "Re-checking…" : "Re-check"}
      </button>
    </div>
  );
}
