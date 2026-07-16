import type { WavelengthClient } from './client.ts';
import { FORCE_UNROLL_ACK } from './requests.ts';
import type {
  ExitInfeasibilityReason,
  ExitResult,
  GetExitPlanResult,
} from './results.ts';

/**
 * Options for {@link exitBatch}, a discriminated union on `mode`. A cooperative
 * batch queues each outpoint into the next round to an optional on-chain
 * `destination`. A unilateral batch forces each outpoint on-chain, funding the
 * recovery from the backing wallet, and previews funding with `getExitPlan`
 * before each start.
 */
export type ExitBatchOptions =
  | { mode: 'cooperative'; outpoints: string[]; destination?: string }
  | { mode: 'unilateral'; outpoints: string[]; confTarget?: number };

/**
 * A progress event emitted by {@link exitBatch} as it works through a batch.
 * `planned` carries the latest unilateral funding plan; `starting` fires before
 * each exit call; `started` fires after one succeeds; `stopped` fires once when
 * the batch halts early.
 */
export type ExitBatchEvent =
  | { type: 'planned'; plan: GetExitPlanResult }
  | { type: 'starting'; outpoint: string }
  | { type: 'started'; outpoint: string; result: ExitResult }
  | { type: 'stopped'; stoppedBy: ExitBatchStop; remaining: string[] };

/**
 * Why an {@link exitBatch} stopped before finishing. `infeasible` means a
 * re-plan reported the backing wallet can no longer fund the remaining exits;
 * `rejected` means an individual `exit` call was rejected by the daemon.
 */
export type ExitBatchStop =
  | { reason: 'infeasible'; plan: GetExitPlanResult }
  | { reason: 'rejected'; outpoint: string; error: Error };

/**
 * The outcome of {@link exitBatch}. `started` lists the exits that were
 * successfully started (each still runs for hours or days afterward on the
 * unilateral path); `skipped` lists outpoints already running an exit;
 * `remaining` lists outpoints never started; `stoppedBy` is present when the
 * batch halted early.
 */
export type ExitBatchResult = {
  started: { outpoint: string; result: ExitResult }[];
  skipped: string[];
  remaining: string[];
  stoppedBy?: ExitBatchStop;
};

/**
 * Distinguishes a fixable exit-infeasibility (the backing wallet needs more
 * confirmed funds or inputs) from a structural one (the VTXO cannot be exited
 * economically at all). Use it to decide whether to show a "fund your wallet"
 * affordance or a terminal "cannot exit this VTXO" message. Mirrors the
 * daemon's own `ExitInfeasibility.Impossible()` split.
 */
export function isExitInfeasibilityFundable(
  reason: ExitInfeasibilityReason,
): boolean {
  return (
    reason === 'wallet_underfunded' || reason === 'wallet_too_few_inputs'
  );
}

/**
 * Starts a batch of exits, one outpoint per daemon call, and reports which
 * started, which were skipped, and which never started. It resolves once every
 * exit has been STARTED, not completed: a unilateral exit continues to run for
 * hours or days after this resolves. On the unilateral path it previews funding
 * with `getExitPlan`, skips outpoints already running an exit, refuses to start
 * anything if the wallet cannot fund the batch, and re-plans between starts;
 * because fee inputs are leased only at broadcast time, it also treats a
 * mid-batch `exit` rejection as a clean stop. On the cooperative path it queues
 * each outpoint into the next round.
 */
export async function exitBatch(
  opts: ExitBatchOptions & {
    client: WavelengthClient;
    signal?: AbortSignal;
    onEvent?: (event: ExitBatchEvent) => void;
  },
): Promise<ExitBatchResult> {
  const { client, signal, onEvent } = opts;
  const started: ExitBatchResult['started'] = [];
  const skipped: string[] = [];
  let remaining = [...opts.outpoints];

  while (remaining.length > 0) {
    signal?.throwIfAborted();

    if (opts.mode === 'unilateral') {
      const currentPlan = await client.getExitPlan({
        outpoints: remaining,
        confTarget: opts.confTarget,
      });
      onEvent?.({ type: 'planned', plan: currentPlan });

      // Drop outpoints the daemon already runs an exit for: it rejects a
      // second exit for one outpoint, and the plan already flags them.
      const running = new Set(
        currentPlan.plans.filter((p) => p.exitJobFound).map((p) => p.outpoint),
      );
      if (running.size > 0) {
        const newlySkipped = remaining.filter(
          (o) => running.has(o) && !skipped.includes(o),
        );
        for (const o of newlySkipped) skipped.push(o);
        remaining = remaining.filter((o) => !running.has(o));
        if (remaining.length === 0) break;
        if (newlySkipped.length > 0) {
          // Re-plan against the reduced set before gating on canStart: the
          // plan we just read still counted the now-skipped (already-running)
          // outpoints, whose leased fee inputs can make the aggregate
          // canStart false.
          continue;
        }
      }

      // Funding is never reserved, so re-planning each round is the only way
      // to notice an earlier start consumed the inputs a later one needs.
      if (!currentPlan.canStart) {
        const stoppedBy: ExitBatchStop = {
          reason: 'infeasible',
          plan: currentPlan,
        };
        onEvent?.({ type: 'stopped', stoppedBy, remaining });
        return { started, skipped, remaining, stoppedBy };
      }
    }

    const outpoint = remaining[0];
    onEvent?.({ type: 'starting', outpoint });
    try {
      const result = await client.exit(
        opts.mode === 'unilateral'
          ? { outpoint, forceUnrollAck: FORCE_UNROLL_ACK }
          : { outpoint, destination: opts.destination },
      );
      started.push({ outpoint, result });
      remaining = remaining.slice(1);
      onEvent?.({ type: 'started', outpoint, result });
    } catch (error) {
      const stoppedBy: ExitBatchStop = {
        reason: 'rejected',
        outpoint,
        error: error as Error,
      };
      onEvent?.({ type: 'stopped', stoppedBy, remaining });
      return { started, skipped, remaining, stoppedBy };
    }
  }

  return { started, skipped, remaining: [] };
}
