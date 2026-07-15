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
