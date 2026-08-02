import { useEffect, useState } from "react";
import { Radio, Square } from "lucide-react";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { GhostButton, PrimaryButton } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import { formatSats } from "../../lib/format";
import { impliedIntervalMs } from "../../stream/controller";
import { useStream } from "../../stream/useStream";

// StreamScreen pays a service by the second.
//
// The two figures side by side are the whole idea. "Owed" runs continuously at
// the rate you typed. "Paid" jumps in chunks, because the rail will not carry
// a payment smaller or more often than it does. We show the gap rather than
// smoothing it away: a meter that measures continuously and settles discretely
// is what every metered utility on earth is, and the honest version is also
// the more interesting one to watch.
export function StreamScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { state, start, stop, error } = useStream();

  const [boardUrl, setBoardUrl] = useState("http://localhost:8088");
  const [rate, setRate] = useState("100");
  const [localError, setLocalError] = useState("");

  // Re-render on a timer while a run is live, so the owed figure moves even
  // between the controller's own state changes.
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (state.phase !== "running") return;

    const id = setInterval(() => setFrame((n) => n + 1), 100);

    return () => clearInterval(id);
  }, [state.phase]);

  const running = state.phase === "running" || state.phase === "registering";
  const rateSatPerSec = Number(rate);
  const rateValid = Number.isFinite(rateSatPerSec) && rateSatPerSec > 0;

  const onStart = async () => {
    setLocalError("");

    if (!rateValid) {
      setLocalError("Enter a rate above zero, in sats per second.");

      return;
    }

    try {
      await start({
        boardUrl: boardUrl.trim(),
        rateMsatPerSec: Math.round(rateSatPerSec * 1000),
      });
    } catch {
      // useStream has already surfaced this through `error`.
    }
  };

  const owedSat = state.accruedMsat / 1000;
  const intervalMs = impliedIntervalMs(
    Math.round(rateSatPerSec * 1000),
    state.chunkSat,
  );

  return (
    <>
      <PageHead
        title="Stream"
        subtitle="Pay a service by the second"
        accent="orange"
        onBack={() => onNavigate("home")}
      />

      <Band>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Board URL"
            value={boardUrl}
            onChange={setBoardUrl}
            disabled={running}
            mono
          />
          <Field
            label="Rate (sats per second)"
            value={rate}
            onChange={setRate}
            disabled={running}
            inputMode="decimal"
          />
        </div>

        {/* The cadence the settings imply, shown up front. At a low enough
            rate the service minimum means a payment every several minutes,
            which is a stalled demo rather than a slow one, and the user
            should see that before starting rather than discover it. */}
        {state.chunkSat > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {formatSats(state.chunkSat)} sats per payment, about one every{" "}
            {(intervalMs / 1000).toFixed(1)}s.
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          {running ? (
            <GhostButton onClick={() => void stop()}>
              <Square className="h-4 w-4" />
              Stop
            </GhostButton>
          ) : (
            <PrimaryButton onClick={() => void onStart()}>
              <Radio className="h-4 w-4" />
              Start streaming
            </PrimaryButton>
          )}
        </div>

        {localError ? <InlineError message={localError} /> : null}
        {error ? <InlineError message={error} /> : null}
      </Band>

      <Band tinted>
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat
            label="Owed"
            value={formatSats(Math.floor(owedSat))}
            unit="sats, accruing continuously"
            tone="owed"
          />
          <Stat
            label="Paid"
            value={formatSats(state.settledSat)}
            unit={`sats, ${state.payments} settled payment${
              state.payments === 1 ? "" : "s"
            }`}
            tone="paid"
          />
          <Stat
            label="Status"
            value={statusLabel(state.phase, state.inFlight)}
            unit={
              state.consecutiveFailures > 0
                ? `${state.consecutiveFailures} failure${
                    state.consecutiveFailures === 1 ? "" : "s"
                  } in a row`
                : " "
            }
          />
        </div>

        {/* A failure that has not yet ended the run still gets said out loud.
            A demo that hides a rejection is worse than one that shows it,
            because the gap in the numbers is going to be visible anyway. */}
        {state.lastError ? (
          <p className="mt-4 text-sm text-orange">{state.lastError}</p>
        ) : null}
      </Band>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "owed" | "paid";
}) {
  const color =
    tone === "owed" ? "text-orange" : tone === "paid" ? "text-teal" : "";

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-mono text-3xl tabular-nums ${color}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{unit}</div>
    </div>
  );
}

function statusLabel(phase: string, inFlight: boolean): string {
  if (inFlight) return "paying";

  switch (phase) {
    case "idle":
      return "idle";
    case "registering":
      return "starting";
    case "running":
      return "streaming";
    case "stopping":
      return "stopping";
    case "stopped":
      return "stopped";
    case "failed":
      return "failed";
    default:
      return phase;
  }
}
