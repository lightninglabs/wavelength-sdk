import type { Balance } from '../results.ts';
import { SETTLE_RECONCILE_DELAYS_MS } from './constants.ts';

/**
 * Whether two balance snapshots carry the same figures. The settle reconcile
 * uses it to decide when a post-activity re-read has caught up: once the
 * balance stops changing across reads there is nothing left to reconcile.
 */
export function balancesEqual(a: Balance | null, b: Balance | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key as keyof Balance] !== b[key as keyof Balance]) {
      return false;
    }
  }

  return true;
}

/** The outcome of one serialized background refresh; never a rejection. */
export type BackgroundRefreshResult = { ok: boolean; balance: Balance | null };

type SettleReconcilerOptions = {
  refresh: () => Promise<BackgroundRefreshResult>;
  baseline: () => Balance | null;
};

/**
 * Balance can lag the activity event that announced a settled entry: the
 * daemon may report the entry complete a beat before balance() reflects the
 * new funds. A single refresh would then capture a stale balance and, with no
 * polling while ready, leave it stale until a manual refresh. Each activity
 * event triggers a cycle: one refresh, then bounded re-reads that stop only
 * once the balance has moved off the pre-event baseline and then held steady.
 * Equality of two consecutive reads alone cannot distinguish settled from
 * still-lagging, so when the balance never moves the whole bounded schedule
 * is probed. A failed refresh deliberately ends the cycle rather than continuing
 * the probe schedule; the next activity event or manual refresh converges it.
 */
export class SettleReconciler {
  // Monotonic id for the current cycle. Every trigger bumps it, retiring any
  // cycle still in flight: clearing the timer alone would only cancel a
  // scheduled probe, not a refresh already in flight.
  #generation = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #opts: SettleReconcilerOptions;

  constructor(opts: SettleReconcilerOptions) {
    this.#opts = opts;
  }

  trigger(): void {
    this.#generation += 1;
    const gen = this.#generation;
    clearTimeout(this.#timer);
    const baseline = this.#opts.baseline();
    void this.#opts.refresh().then((first) => {
      if (gen !== this.#generation || !first.ok) {
        return;
      }
      this.#probe(0, gen, baseline, first.balance);
    });
  }

  cancel(): void {
    this.#generation += 1;
    clearTimeout(this.#timer);
  }

  #probe(
    attempt: number,
    gen: number,
    baseline: Balance | null,
    prev: Balance | null,
  ): void {
    if (attempt >= SETTLE_RECONCILE_DELAYS_MS.length) {
      return;
    }
    this.#timer = setTimeout(() => {
      if (gen !== this.#generation) {
        return;
      }
      void this.#opts.refresh().then((res) => {
        if (gen !== this.#generation || !res.ok) {
          return;
        }
        const moved = !balancesEqual(baseline, res.balance);
        const steady = balancesEqual(prev, res.balance);
        if (moved && steady) {
          return;
        }
        this.#probe(attempt + 1, gen, baseline, res.balance);
      });
    }, SETTLE_RECONCILE_DELAYS_MS[attempt]);
  }
}
