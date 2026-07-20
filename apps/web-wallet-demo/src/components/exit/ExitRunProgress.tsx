import { Check, CircleCheck, RotateCcw } from "lucide-react";
import type {
  ExitBatchEvent,
  ExitBatchResult,
  ExitBatchStop,
} from "@lightninglabs/wavelength-react";
import { Band } from "../ui/Band";
import { Label } from "../ui/Label";
import { InlineError } from "../ui/InlineError";
import { formatSats, shortKey } from "../../lib/format";

type ExitMode = "cooperative" | "unilateral";

// explainStop turns a batch stop into a human sentence. An infeasible stop is
// recoverable (top up the backing wallet and retry the rest); a rejection
// names the outpoint the daemon refused.
export function explainStop(stop: ExitBatchStop): string {
  if (stop.reason === "infeasible") {
    return "The backing wallet can no longer fund the remaining exits. Fund it and try the rest again.";
  }

  return `Exit for ${stop.outpoint} was rejected: ${stop.error.message}`;
}

// successMessage narrates what happens next once a batch resolves cleanly, so
// the tester knows where the funds go and how long it takes on each path.
function successMessage(mode: ExitMode, count: number, totalSat: number): string {
  const outputs = `${count} output${count === 1 ? "" : "s"}`;

  if (mode === "cooperative") {
    return `Cooperative exit queued. Your ${outputs} (${formatSats(totalSat)} sats) will leave to the address you entered, or a new address in your on-chain wallet if you left it blank, when the next round settles (up to ~60s). It then appears in Activity and lands in your on-chain balance below.`;
  }

  return "Unilateral exit started. It runs on-chain over roughly the next 12+ blocks (materialize, timelock, sweep). Track it in the banner and the status panel above; funds arrive in your on-chain balance when the sweep confirms.";
}

// ExitRunProgress narrates a batch run as it happens: one row per exit that has
// started, and, once the batch resolves, either a mode-aware success panel with
// a "Start another exit" reset or the reason it stopped.
export function ExitRunProgress({
  events,
  mode,
  data,
  totalSat,
  onStartAnother,
}: {
  events: readonly ExitBatchEvent[];
  mode: ExitMode;
  data: ExitBatchResult | null;
  totalSat: number;
  onStartAnother: () => void;
}) {
  const started = events.filter((e) => e.type === "started");
  const stopped = events.find((e) => e.type === "stopped");
  const succeeded = data !== null && !data.stoppedBy;

  return (
    <Band tinted>
      <div data-testid="exit-run-progress">
        <Label rule>Exit progress</Label>
        <div className="mt-4 space-y-2">
          {started.map((e) => {
            const outpoint = (e as { outpoint: string }).outpoint;

            return (
              <div
                key={outpoint}
                className="flex items-center gap-2.5 text-sm text-fg"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center
                    [background:color-mix(in_srgb,var(--good)_14%,transparent)]
                    text-good"
                >
                  <Check size={12} strokeWidth={3} />
                </span>
                <span className="text-muted">Started</span>
                <span className="font-mono text-xs text-fg">
                  {shortKey(outpoint)}
                </span>
              </div>
            );
          })}
        </div>
        {succeeded ? (
          <div
            data-testid="exit-success"
            className="mt-4 flex items-start gap-2.5 border border-good/35
              bg-good/10 p-3.5"
          >
            <CircleCheck size={16} className="mt-0.5 shrink-0 text-good" />
            <p className="text-sm leading-relaxed text-fg">
              {successMessage(mode, data.started.length, totalSat)}
            </p>
          </div>
        ) : null}
        {stopped ? (
          <div className="mt-4">
            <InlineError
              message={explainStop(
                (stopped as { stoppedBy: ExitBatchStop }).stoppedBy,
              )}
            />
          </div>
        ) : null}
        {data !== null ? (
          <button
            type="button"
            data-testid="exit-start-another"
            onClick={onStartAnother}
            className="mt-4 inline-flex items-center justify-center gap-2 border
              border-border bg-surface-alt px-4 py-2.5 text-sm font-medium
              text-fg transition-colors hover:border-border-strong"
          >
            <RotateCcw size={16} /> Start another exit
          </button>
        ) : null}
      </div>
    </Band>
  );
}
