import { INITIAL_SNAPSHOT, type WalletSnapshot } from './snapshot.ts';

/**
 * A minimal immutable snapshot holder: getSnapshot/subscribe for consumers
 * (React's useSyncExternalStore contract) and update(patch) for the engine.
 * getSnapshot and subscribe are arrow-function properties so their identities
 * are stable across the engine's lifetime.
 */
export class SnapshotStore {
  #snapshot: WalletSnapshot = INITIAL_SNAPSHOT;
  readonly #listeners = new Set<() => void>();

  getSnapshot = (): WalletSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Shallow-merges the patch into a fresh snapshot and notifies listeners.
   * Skips the allocation and the notification entirely when every key in the
   * patch is already Object.is-equal to the current value: a no-op patch
   * would otherwise still mint a new snapshot object and fire every
   * subscriber for nothing.
   */
  update(patch: Partial<WalletSnapshot>): void {
    let changed = false;
    for (const key in patch) {
      if (!Object.is(this.#snapshot[key as keyof WalletSnapshot], patch[key as keyof WalletSnapshot])) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // A throwing listener must not break the store or other listeners.
      }
    }
  }
}
