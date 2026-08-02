import type { WavelengthClient } from '../client.ts';
import type { Entry } from '../results.ts';
import {
  ACTIVITY_DEBOUNCE_MS,
  STREAM_BACKOFF_CAP_MS,
  STREAM_BACKOFF_MS,
  STREAM_FAILURE_LIMIT,
} from './constants.ts';

/**
 * Owns the daemon activity subscription while the wallet is ready: opening
 * (with an includeExisting replay so changes missed while down are caught),
 * reopening with a capped exponential backoff, debouncing activity events into
 * onActivity, and giving up through onDead after too many consecutive failed
 * opens (the counter includes the initial open, not just reopens).
 */
export class ActivityStream {
  #running = false;
  #cursor = 0;
  /**
   * Preimages seen on the stream, keyed by payment hash.
   *
   * The daemon reveals a send's preimage exactly once, on the entry it pushes
   * when the swap settles, and omits it from the list snapshot that every
   * later refresh reads. Without remembering it here the field is unreachable
   * through any public API: the stream event is consumed for its cursor and
   * the body discarded, and the refresh that follows overwrites the entry with
   * a copy that has none.
   *
   * That matters because a preimage is proof of payment, and the only way a
   * caller can demonstrate to a third party that an invoice was actually
   * settled. Holding them in memory is enough: they are re-delivered on the
   * includeExisting replay when a stream reopens.
   */
  #preimages = new Map<string, string>();
  #backoff = STREAM_BACKOFF_MS;
  #failures = 0;
  #lifecycleGeneration = 0;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  // Tracks the lifecycle whose startActivity() call is unsettled. A stream
  // loss within that lifecycle must not double-subscribe, while a stop/start
  // must be able to open even if the stopped lifecycle has not settled yet.
  #openingGeneration: number | undefined;
  #opts: {
    client: Pick<WavelengthClient, 'startActivity' | 'stopActivity'>;
    onActivity: () => void;
    onReconcile: () => void;
    onDead: (error: Error) => void;
  };

  constructor(opts: {
    client: Pick<WavelengthClient, 'startActivity' | 'stopActivity'>;
    onActivity: () => void;
    onReconcile: () => void;
    onDead: (error: Error) => void;
  }) {
    this.#opts = opts;
  }

  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#lifecycleGeneration += 1;
    this.#cursor = 0;
    this.#backoff = STREAM_BACKOFF_MS;
    this.#failures = 0;
    this.#open(this.#lifecycleGeneration);
  }

  stop(): void {
    if (!this.#running) {
      this.#cursor = 0;
      return;
    }
    this.#running = false;
    this.#lifecycleGeneration += 1;
    this.#cursor = 0;
    this.#preimages.clear();
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#debounce);
    this.#opts.client.stopActivity();
  }

  /**
   * Returns the preimage seen for a payment hash, or undefined. It is the only
   * route to a settled send's proof of payment; see #preimages.
   */
  preimageFor(paymentHash: string): string | undefined {
    return this.#preimages.get(paymentHash);
  }

  /** Every preimage seen so far, for merging into a refreshed snapshot. */
  preimages(): ReadonlyMap<string, string> {
    return this.#preimages;
  }

  /** Forwarded 'activity' client events; debounced into one onActivity call. */
  noteActivity(entry: Pick<Entry, 'cursor'> & Partial<Entry>): void {
    if (!this.#running) {
      return;
    }
    if (Number.isSafeInteger(entry.cursor) && entry.cursor > this.#cursor) {
      this.#cursor = entry.cursor;
    }

    // Capture the proof before the body is dropped. This is the only moment
    // it exists anywhere the SDK can see.
    const progress = entry.progress;
    if (progress?.paymentHash && progress.preimage) {
      this.#preimages.set(progress.paymentHash, progress.preimage);
    }
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => this.#opts.onActivity(), ACTIVITY_DEBOUNCE_MS);
  }

  /** Forwarded 'activityStream' client events: the stream was lost; reopen. */
  noteStreamLost(): void {
    if (this.#running) {
      this.#opts.onReconcile();
      this.#scheduleRetry(this.#lifecycleGeneration);
    }
  }

  #open(lifecycle: number): void {
    if (this.#openingGeneration === lifecycle) {
      return;
    }
    this.#openingGeneration = lifecycle;
    this.#opts.client.startActivity({
      includeExisting: this.#cursor === 0,
      cursor: this.#cursor,
    }).then(
      () => {
        if (this.#openingGeneration === lifecycle) {
          this.#openingGeneration = undefined;
        }
        if (!this.#running || lifecycle !== this.#lifecycleGeneration) {
          return;
        }
        // The initial open replays existing entries. Cursor reopens rely on
        // noteStreamLost's immediate reconciliation before resuming.
        this.#backoff = STREAM_BACKOFF_MS;
        this.#failures = 0;
      },
      () => {
        if (this.#openingGeneration === lifecycle) {
          this.#openingGeneration = undefined;
        }
        this.#onReopenFailure(lifecycle);
      },
    );
  }

  #onReopenFailure(lifecycle: number): void {
    if (!this.#running || lifecycle !== this.#lifecycleGeneration) {
      return;
    }
    this.#failures += 1;
    if (this.#failures >= STREAM_FAILURE_LIMIT) {
      // The stream could not be re-established after repeated attempts;
      // surface it instead of leaving the wallet looking healthy while its
      // balance and history silently stop updating.
      this.#running = false;
      clearTimeout(this.#retryTimer);
      clearTimeout(this.#debounce);
      this.#opts.onDead(
        new Error('lost the activity stream and could not reconnect'),
      );

      return;
    }
    this.#scheduleRetry(lifecycle);
  }

  #scheduleRetry(lifecycle: number): void {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => {
      if (!this.#running || lifecycle !== this.#lifecycleGeneration) {
        return;
      }
      this.#backoff = Math.min(this.#backoff * 2, STREAM_BACKOFF_CAP_MS);
      this.#open(lifecycle);
    }, this.#backoff);
  }
}
