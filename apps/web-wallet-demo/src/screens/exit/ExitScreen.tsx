import { useEffect, useState } from "react";
import { ArrowRight, LogOut, ShieldAlert } from "lucide-react";
import {
  useWalletExitBatch,
  useWalletExitPlan,
  useWalletExits,
  useWalletList,
} from "@lightninglabs/wavelength-react";
import type { AppTab } from "../../components/layout/nav";
import { PageHead } from "../../components/layout/PageHead";
import { Band } from "../../components/ui/Band";
import { Label } from "../../components/ui/Label";
import { Field } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { VTXOPicker } from "../../components/exit/VTXOPicker";
import { ExitPlanSummary } from "../../components/exit/ExitPlanSummary";
import { ExitAckDialog } from "../../components/exit/ExitAckDialog";
import { ExitRunProgress } from "../../components/exit/ExitRunProgress";
import { ExitStatusPanel } from "../../components/exit/ExitStatusPanel";
import { PhaseChip } from "../../components/exit/PhaseChip";
import { shortKey } from "../../lib/format";

type ExitMode = "cooperative" | "unilateral";

// MODE_HINT explains the trade-off behind each path so the choice is legible
// before the user commits.
const MODE_HINT: Record<ExitMode, string> = {
  cooperative:
    "Leaves with the operator's help in the next round. Fast and cheap; needs the operator online.",
  unilateral:
    "Forces your funds on-chain without anyone's cooperation. Always available, but slow and pays on-chain fees.",
};

// ExitScreen is the reference Emergency exit flow: pick VTXOs, choose a
// cooperative or unilateral path, preview the funding plan for a unilateral
// exit, and start the batch. Any in-progress exits are tracked live at the top.
// It is reached from Settings, not the bottom bar, like the wallet-lifecycle
// screens.
export function ExitScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<ExitMode>("cooperative");
  const [destination, setDestination] = useState("");
  const [ackOpen, setAckOpen] = useState(false);
  const { plan, planData, planPending, resetPlan } = useWalletExitPlan();
  const {
    exitBatch,
    exitBatchEvents,
    exitBatchPending,
    exitBatchData,
    resetExitBatch,
  } = useWalletExitBatch();
  const { summary } = useWalletExits();
  const { list, listData, listPending, listError } = useWalletList();

  useEffect(() => {
    void list({ view: "vtxos" });
  }, [list]);

  useEffect(() => {
    if (mode === "unilateral" && selected.length > 0) {
      void plan({ outpoints: selected });
    }
  }, [mode, selected, plan]);

  // Sum the sats of the outpoints that actually started, for the success panel.
  // Amounts come from the VTXO inventory, which the ExitResult does not carry.
  const vtxos = listData?.vtxos?.vtxos ?? [];
  const startedTotalSat = (exitBatchData?.started ?? []).reduce(
    (sum, e) =>
      sum + (vtxos.find((v) => v.outpoint === e.outpoint)?.amountSat ?? 0),
    0,
  );

  // Start another exit: clear the picker, destination, and plan, and drop
  // the last batch result so the run-progress panel resets.
  const startAnother = () => {
    setSelected([]);
    setDestination("");
    resetPlan();
    resetExitBatch();
  };

  const start = () =>
    mode === "unilateral"
      ? exitBatch({ mode, outpoints: selected })
      : exitBatch({
        mode,
        outpoints: selected,
        destination: destination || undefined,
      });

  return (
    <div>
      <PageHead
        title="Emergency exit"
        subtitle="Recover your funds on-chain"
        accent="orange"
        onBack={() => onNavigate("settings")}
      />

      {summary && summary.exits.length > 0 ? (
        <Band tinted>
          <Label accent="orange" rule>In progress</Label>
          <div className="mt-4 space-y-3">
            {summary.exits.map((e) => (
              <div
                key={e.outpoint}
                data-testid="exit-summary-row"
                className="border border-border bg-surface px-4 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <PhaseChip status={e.status} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                    {shortKey(e.outpoint)}
                  </span>
                </div>
                <ExitStatusPanel outpoint={e.outpoint} />
              </div>
            ))}
          </div>
        </Band>
      ) : null}

      <Band>
        <Label accent="orange" rule>Choose VTXOs</Label>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Select the outputs to exit. Leave the rest in place to keep spending
          normally.
        </p>
        <VTXOPicker
          vtxos={vtxos}
          pending={listPending}
          error={listError}
          selected={selected}
          onChange={setSelected}
          excludeOutpoints={summary?.exits.map((e) => e.outpoint) ?? []}
        />
      </Band>

      <Band tinted>
        <Label accent="orange" rule>Exit path</Label>
        <div className="mt-4">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "cooperative", label: "Cooperative" },
              { value: "unilateral", label: "Unilateral" },
            ]}
          />
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted">{MODE_HINT[mode]}</p>

        <div className="mt-4">
          {mode === "cooperative" ? (
            <Field
              label="Destination (optional)"
              placeholder="tb1q… · defaults to your wallet"
              value={destination}
              onChange={setDestination}
              mono
            />
          ) : planData ? (
            <ExitPlanSummary
              plan={planData}
              onRecheck={() => void plan({ outpoints: selected })}
              recheckPending={planPending}
            />
          ) : null}
        </div>

        <div className="mt-5">
          {mode === "unilateral" ? (
            <button
              type="button"
              data-testid="open-ack"
              disabled={selected.length === 0 || !planData?.canStart}
              onClick={() => setAckOpen(true)}
              className="inline-flex items-center justify-center gap-2 border
                border-bad bg-bad/10 px-4 py-2.5 text-sm font-semibold text-bad
                transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ShieldAlert size={16} /> Force unilateral exit
            </button>
          ) : (
            <button
              type="button"
              data-testid="start-cooperative"
              disabled={selected.length === 0 || exitBatchPending}
              onClick={() => void start().catch(() => {})}
              className="inline-flex items-center justify-center gap-2 bg-accent-fill
                px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity
                hover:opacity-90 disabled:opacity-50"
            >
              <LogOut size={16} />
              {exitBatchPending ? "Starting…" : "Exit cooperatively"}
              {!exitBatchPending ? <ArrowRight size={16} /> : null}
            </button>
          )}
        </div>
      </Band>

      <ExitAckDialog
        open={ackOpen}
        busy={exitBatchPending}
        onConfirm={() => {
          setAckOpen(false);
          void start().catch(() => {});
        }}
        onCancel={() => setAckOpen(false)}
      />

      {exitBatchEvents.length > 0 ? (
        <ExitRunProgress
          events={exitBatchEvents}
          mode={mode}
          data={exitBatchData}
          totalSat={startedTotalSat}
          onStartAnother={startAnother}
        />
      ) : null}
    </div>
  );
}
