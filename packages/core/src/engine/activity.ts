import type { WalletDKClient } from '../client.ts';
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
  #backoff = STREAM_BACKOFF_MS;
  #failures = 0;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #debounce: ReturnType<typeof setTimeout> | undefined;
  // True while a startActivity() call is unsettled. noteStreamLost() can race
  // an #open() already in flight (the daemon reports the stream lost right
  // after we asked it to reopen); without this guard that race would fire a
  // second concurrent startActivity() and double-subscribe.
  #opening = false;
  #opts: {
    client: Pick<WalletDKClient, 'startActivity' | 'stopActivity'>;
    onActivity: () => void;
    onDead: (error: Error) => void;
  };

  constructor(opts: {
    client: Pick<WalletDKClient, 'startActivity' | 'stopActivity'>;
    onActivity: () => void;
    onDead: (error: Error) => void;
  }) {
    this.#opts = opts;
  }

  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#backoff = STREAM_BACKOFF_MS;
    this.#failures = 0;
    this.#open();
  }

  stop(): void {
    if (!this.#running) {
      return;
    }
    this.#running = false;
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#debounce);
    this.#opts.client.stopActivity();
  }

  /** Forwarded 'activity' client events; debounced into one onActivity call. */
  noteActivity(): void {
    if (!this.#running) {
      return;
    }
    clearTimeout(this.#debounce);
    this.#debounce = setTimeout(() => this.#opts.onActivity(), ACTIVITY_DEBOUNCE_MS);
  }

  /** Forwarded 'activityStream' client events: the stream was lost; reopen. */
  noteStreamLost(): void {
    if (this.#running) {
      this.#scheduleRetry();
    }
  }

  #open(): void {
    if (this.#opening) {
      return;
    }
    this.#opening = true;
    this.#opts.client.startActivity({ includeExisting: true }).then(
      () => {
        this.#opening = false;
        if (!this.#running) {
          return;
        }
        // A clean open replays existing entries (includeExisting), which
        // drives the debounced refresh, so missed changes are caught.
        this.#backoff = STREAM_BACKOFF_MS;
        this.#failures = 0;
      },
      () => {
        this.#opening = false;
        this.#onReopenFailure();
      },
    );
  }

  #onReopenFailure(): void {
    if (!this.#running) {
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
    this.#scheduleRetry();
  }

  #scheduleRetry(): void {
    clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => {
      this.#backoff = Math.min(this.#backoff * 2, STREAM_BACKOFF_CAP_MS);
      this.#open();
    }, this.#backoff);
  }
}
