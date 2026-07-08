/**
 * A fixed-interval async poll with an optional consecutive-failure budget.
 * The sync poll and the restore readiness poll are both instances of this.
 */
export class Poller {
  #timer: ReturnType<typeof setInterval> | undefined;
  #failures = 0;
  #inFlight = false;
  #opts: {
    intervalMs: number;
    /** Run one tick immediately on start, before the first interval. */
    immediate?: boolean;
    /** Consecutive rejected ticks before the poll gives up. Unset means never. */
    failureLimit?: number;
    tick: () => Promise<void>;
    onExhausted?: (error: unknown) => void;
  };

  constructor(opts: {
    intervalMs: number;
    /** Run one tick immediately on start, before the first interval. */
    immediate?: boolean;
    /** Consecutive rejected ticks before the poll gives up. Unset means never. */
    failureLimit?: number;
    tick: () => Promise<void>;
    onExhausted?: (error: unknown) => void;
  }) {
    this.#opts = opts;
  }

  get running(): boolean {
    return this.#timer !== undefined;
  }

  start(): void {
    if (this.#timer) {
      return;
    }
    this.#failures = 0;
    this.#timer = setInterval(() => void this.#tick(), this.#opts.intervalMs);
    if (this.#opts.immediate) {
      void this.#tick();
    }
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async #tick(): Promise<void> {
    // A tick slower than the interval must not stack up behind itself.
    if (this.#inFlight || !this.#timer) {
      return;
    }
    this.#inFlight = true;
    try {
      await this.#opts.tick();
      this.#failures = 0;
    } catch (err) {
      this.#failures += 1;
      if (this.#opts.failureLimit && this.#failures >= this.#opts.failureLimit) {
        this.stop();
        this.#opts.onExhausted?.(err);
      }
    } finally {
      this.#inFlight = false;
    }
  }
}
