import {
  AlertTriangle,
  ArrowUpRight,
  Info,
  Link2,
  RefreshCw,
  Timer,
  Zap,
} from "lucide-react";
import { PrepareSendResult, SendRail } from "@lightninglabs/walletdk-react";
import { Band } from "../../components/ui/Band";
import { GhostButton } from "../../components/ui/Button";
import { InlineError } from "../../components/ui/InlineError";
import { Label } from "../../components/ui/Label";
import { SummaryRow } from "../../components/ui/SummaryRow";
import { cn } from "../../lib/cn";
import { approx, countdown, formatSats } from "../../lib/format";

// RAIL_LABEL names each settlement rail for the pill above the review rows. The
// quote is authoritative here: an invoice-shaped destination can still settle
// in Ark, on credit, or across a mix (an address always settles on-chain).
// Keep this identical to the RN copy.
const RAIL_LABEL: Record<SendRail, string> = {
  unspecified: "Payment",
  offchain_unknown: "Off-chain",
  in_ark: "In Ark",
  lightning: "Lightning",
  onchain: "On-chain",
  credit: "Credit",
  mixed: "Mixed",
};

// feeLabel names the fee row per rail. A routing fee and a mining fee are
// different things and the old screen called both "routing".
function feeLabel(rail: SendRail): string {
  if (rail === "lightning") {
    return "Routing fee";
  }

  if (rail === "onchain") {
    return "Network fee";
  }

  return "Fee";
}

// railIcon matches the Confirm button to the rail the quote actually settles on.
// A lightning bolt on an on-chain payment is a lie about where the money goes.
function railIcon(rail: SendRail) {
  if (rail === "lightning") return Zap;
  if (rail === "onchain") return Link2;
  return ArrowUpRight;
}

// QuoteReview presents a prepareSend quote and the single action it permits: a
// live quote can be paid, an expired one can only be re-quoted. Every value
// here comes from the daemon; nothing is user-entered.
export function QuoteReview({
  quote,
  destination,
  expired,
  secondsLeft,
  quoting,
  busy,
  error,
  onConfirm,
  onRefresh,
}: {
  quote: PrepareSendResult;
  destination: string;
  expired: boolean;
  secondsLeft: number;
  quoting: boolean;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const Icon = railIcon(quote.rail);
  const showTo =
    quote.destinationSummary && quote.destinationSummary !== destination.trim();

  return (
    <Band tinted>
      <div className="flex items-center justify-between">
        <Label>Review</Label>
        <span className="bg-accent-soft px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
          {RAIL_LABEL[quote.rail]}
        </span>
      </div>

      <div className={cn("mt-4 space-y-3 text-sm", expired && "opacity-30")}>
        {showTo ? (
          <SummaryRow label="To" value={quote.destinationSummary} mono />
        ) : null}
        {quote.invoiceDescription ? (
          <SummaryRow label="For" value={quote.invoiceDescription} />
        ) : null}
        <SummaryRow label="Amount" value={`${formatSats(quote.amountSat)} sats`} mono />
        <SummaryRow
          label={feeLabel(quote.rail)}
          value={approx(quote.expectedFeeSat, quote.feeKnown)}
          mono
        />
        <div className="h-px bg-border" />
        <SummaryRow
          label="Total"
          value={approx(quote.expectedTotalOutflowSat, quote.totalOutflowKnown)}
          mono
        />
      </div>

      {expired ? (
        <div className="mt-4 flex items-start gap-2 border border-bad/35 bg-bad/10 p-3 text-xs text-bad">
          <Timer size={14} className="mt-0.5 shrink-0" />
          This quote expired. Fees may have changed.
        </div>
      ) : quote.warning ? (
        <div className="mt-4 flex items-start gap-2 border border-warn/35 bg-warn/10 p-3 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {quote.warning}
        </div>
      ) : !quote.feeKnown ? (
        <div className="mt-4 flex items-start gap-2 border border-border bg-well p-3 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          The fee shown is an estimate. The final amount is returned once the
          payment settles.
        </div>
      ) : null}

      <div className="mt-5">
        {expired ? (
          <GhostButton
            icon={RefreshCw}
            onClick={onRefresh}
            disabled={quoting}
            busy={quoting}
            block={false}
          >
            Refresh quote
          </GhostButton>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5
              text-sm font-semibold text-white transition-opacity
              hover:opacity-90 disabled:opacity-50"
          >
            <Icon size={16} /> {busy ? "Paying…" : "Confirm & pay"}
          </button>
        )}
      </div>

      {!expired ? (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
          Quote valid for {countdown(secondsLeft)}
        </div>
      ) : null}

      <div className="mt-3">
        <InlineError message={error} />
      </div>
    </Band>
  );
}
