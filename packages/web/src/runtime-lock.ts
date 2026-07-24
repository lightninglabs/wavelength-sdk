import { WavelengthError, errorMessage } from '@lightninglabs/wavelength-core';

/**
 * The Web Locks name guarding the wasm runtime for this origin. The lock is
 * scoped to the whole runtime per origin, not to any single storage path,
 * because the daemon opens several exclusive OPFS SQLite stores whose paths are
 * configured independently: the wallet database under `dataDir`, the swap
 * database at its own `swapDatabaseFileName`, and paths chosen by daemon
 * defaults. Only one tab (or window) per origin can run the wallet at a time,
 * and a second tab detects that here before booting anything. Keying the lock
 * by `dataDir` alone would let two tabs that differ only in `dataDir` but share,
 * for example, the default swap database boot together and collide on it.
 */
export const RUNTIME_LOCK_NAME = 'wavelength-web-runtime';

type LocksApi = {
  request: (
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => unknown,
  ) => Promise<unknown>;
};

function webLocks(): LocksApi | undefined {
  return (globalThis as { navigator?: { locks?: LocksApi } }).navigator?.locks;
}

const NO_WEB_LOCKS_WARNING =
  'This browser has no Web Locks API, so Wavelength cannot detect the ' +
  'wallet running in another tab before starting the runtime. Opening the ' +
  'wallet in two tabs may fail on the daemon database instead.';

// Warned once per document: without Web Locks the cross-tab guard is inert, and
// a second tab's corruption would otherwise be invisible to whoever debugs it.
let warnedNoWebLocks = false;

function warnNoWebLocks(onWarn: ((message: string) => void) | undefined): void {
  if (warnedNoWebLocks) {
    return;
  }
  warnedNoWebLocks = true;
  // Both channels, not one or the other. onWarn reaches a host that renders
  // log events, but a consumer driving the client directly may have no
  // subscribers at all, and this warning is too important to lose to an empty
  // listener set.
  onWarn?.(NO_WEB_LOCKS_WARNING);
  console.warn(NO_WEB_LOCKS_WARNING);
}

/** Options for {@link RuntimeLock}. */
export type RuntimeLockOptions = {
  /**
   * Receives a warning when the lock cannot work as intended: the browser has
   * no Web Locks API, or a release did not settle cleanly. A transport passes
   * one so the message reaches the host's log channel instead of only the
   * developer console, where an end user never sees it.
   */
  onWarn?: (message: string) => void;
};

/**
 * Reports whether a raw daemon or SQLite failure message describes the wallet
 * database being held by another browser context. Used to map such failures to
 * the `wallet_locked` error code on a browser with no Web Locks support, where
 * there is no pre-check to catch them.
 *
 * This is a best-effort backstop, not the guarantee: the Web Lock is what
 * actually keeps a second tab from opening the databases, and on every browser
 * that ships the Web Locks API a second tab is rejected before its daemon runs,
 * so this classifier is never consulted there. Matching daemon prose is
 * inherently partial, and it can drift in either direction (the daemon rewording
 * a contention error, or a failure shape it never anticipated). It only widens
 * the set of contention messages the no-Web-Locks path can still surface as
 * `wallet_locked`; a message it does not match falls through to a generic error,
 * and one it matches by mistake would mislead a sole tab, so the fragments are
 * kept narrow rather than broad. Widening the pattern requires confirming the
 * daemon's actual contention strings first.
 *
 * Every fragment names cross-context contention specifically. Two neighbouring
 * messages are deliberately excluded, because both occur with nothing held by
 * another tab and would send the user hunting for a window that does not
 * exist: the daemon's fail-closed open ("persistent storage required"), which
 * a sole tab in a browser without persistent storage reports too, and the
 * SQLite worker's duplicate-open guard ("already open in this worker"), which
 * describes this tab's own worker.
 */
export function isWalletLockedMessage(message: string): boolean {
  return /database is locked|SQLITE_BUSY|Access Handles cannot be created/i.test(
    message,
  );
}

/**
 * Reports whether a message that {@link isWalletLockedMessage} rejected still
 * names the browser storage layer. Matching daemon prose is inherently brittle:
 * if the daemon rewords a contention error, classification silently degrades to
 * a generic failure and the host stops offering the multi-tab advice. A near
 * miss is the only signal that has happened, so transports log one rather than
 * letting the drift pass unnoticed.
 *
 * It deliberately looks for the storage subsystem rather than the word "lock",
 * which a wallet uses constantly for something unrelated: a wallet waiting to
 * be unlocked reports being locked on a completely routine path, and treating
 * that as a near miss would bury the real signal in noise.
 *
 * The `\bbusy\b` fragment is broader than the SQLite-specific ones and can match
 * unrelated prose (a "server busy" message, say). That is tolerable here: a near
 * miss only escalates a warn-level drift log and never changes control flow, so
 * a rare false positive costs a stray warn, not a misclassified error.
 */
export function isNearMissLockMessage(message: string): boolean {
  return (
    !isWalletLockedMessage(message) &&
    /SQLITE_|\bopfs\b|access handle|\bbusy\b/i.test(message)
  );
}

/**
 * A lease identifies one acquisition of the {@link RuntimeLock}. Every
 * {@link RuntimeLock.acquire} mints a fresh lease, and release only frees the
 * grant when handed the lease that currently owns it. A release from a
 * superseded session (a stop whose start has already handed the runtime on, a
 * dead worker's late teardown) presents an old lease and is therefore inert,
 * which is what stops one session from freeing the lock another is relying on.
 */
export type RuntimeLockLease = number;

// The lease value that never owns a grant: the initial value of a session's
// lease before its first acquire. mintLease is monotonic from 1, so this
// sentinel never matches a live grant and releasing it is always a no-op. A
// session keeps its real lease value after a release rather than resetting to
// this; the grant's staleness check (state.lease !== lease) is what makes a
// superseded release inert, not re-issuing the sentinel.
export const NO_RUNTIME_LEASE: RuntimeLockLease = 0;

// The lock's lifecycle as one explicit value, so illegal combinations (held and
// acquiring at once, a release request outside an acquisition) cannot be
// represented. `held` covers the no-Web-Locks case too, with a no-op release.
type LockState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'acquiring';
      readonly lease: RuntimeLockLease;
      readonly promise: Promise<RuntimeLockLease>;
    }
  | {
      readonly kind: 'held';
      readonly lease: RuntimeLockLease;
      readonly release: () => void;
    }
  | { readonly kind: 'settling'; readonly settle: Promise<void> };

/**
 * A held-until-released Web Lock around the wallet runtime. acquire() fails
 * fast with a `wallet_locked` {@link WavelengthError} when another tab already
 * holds the runtime, instead of letting the daemon boot and trip over the
 * exclusive OPFS SQLite handles. On browsers without the Web Locks API
 * acquire() is a no-op; the daemon-side "database is locked" failure remains
 * the backstop there.
 *
 * The browser releases the lock automatically when the holding tab closes or
 * crashes, so a stale lock cannot outlive its tab.
 *
 * Every acquire() returns a {@link RuntimeLockLease}; releases must present the
 * lease they took, and act only when it still owns the grant. Callers thread
 * their lease through every teardown path so a release from a session that has
 * already been superseded does nothing.
 */
export class RuntimeLock {
  #state: LockState = { kind: 'idle' };
  #lastLease: RuntimeLockLease = NO_RUNTIME_LEASE;
  // The in-flight locks.request() promise for the current grant. It settles
  // once the browser has actually freed the lock, later than the moment
  // release() asks it to, so releaseAndSettle() waits on it before telling a
  // caller the lock is free. Companion to `held`; null otherwise.
  #granted: Promise<unknown> | null = null;
  readonly #onWarn: ((message: string) => void) | undefined;

  constructor(options: RuntimeLockOptions = {}) {
    // Assigned explicitly rather than via a constructor parameter property,
    // which node's strip-only TypeScript loader (used by the unit tests) does
    // not support.
    this.#onWarn = options.onWarn;
  }

  /**
   * Whether a grant is currently held, i.e. a session is already running under
   * this lock. A caller checks this before {@link acquire} to tell a redundant
   * start (the lock is already ours) from a fresh one, so it can coalesce
   * rather than re-invoke the daemon on an already-running session. It reports
   * only the settled `held` state: while a request is still in flight
   * (`acquiring`) or a release is draining (`settling`) it is false, which is
   * correct, because in neither case is there a live grant to coalesce onto.
   */
  get held(): boolean {
    return this.#state.kind === 'held';
  }

  #mintLease(): RuntimeLockLease {
    this.#lastLease += 1;

    return this.#lastLease;
  }

  /**
   * Acquires the runtime lock, resolving with the lease once held. Idempotent
   * while held (a repeat acquire mints a new lease on the same grant, so the
   * newer caller owns the release) and coalescing while a request is in flight.
   *
   * Rejects with `wallet_locked` when another context holds the lock, the
   * expected multi-tab condition a host shows actionable copy for. Rejects with
   * `runtime_lock_unavailable` when the browser refused or dropped the lock
   * request itself (for example while the document is shutting down), which says
   * nothing about other tabs.
   */
  acquire(): Promise<RuntimeLockLease> {
    const state = this.#state;

    if (state.kind === 'held') {
      const lease = this.#mintLease();
      this.#state = { kind: 'held', lease, release: state.release };

      return Promise.resolve(lease);
    }

    if (state.kind === 'acquiring') {
      return state.promise;
    }

    if (state.kind === 'settling') {
      // A release is still settling with the browser; wait it out, then acquire
      // fresh, so a retry right after a teardown does not issue its request
      // while the old lock is still held and get wallet_locked back.
      return state.settle.then(() => this.acquire());
    }

    const locks = webLocks();
    if (!locks) {
      warnNoWebLocks(this.#onWarn);
      const lease = this.#mintLease();
      this.#state = { kind: 'held', lease, release: () => undefined };

      return Promise.resolve(lease);
    }

    return this.#request(locks);
  }

  #request(locks: LocksApi): Promise<RuntimeLockLease> {
    const lease = this.#mintLease();
    let resolveLease!: (lease: RuntimeLockLease) => void;
    let rejectLease!: (err: unknown) => void;
    const promise = new Promise<RuntimeLockLease>((resolve, reject) => {
      resolveLease = resolve;
      rejectLease = reject;
    });
    // Move to `acquiring` before issuing the request, so the state is settled
    // before the grant callback runs. The real Web Locks callback is always
    // async, so ordering never races it there; the test double invokes it
    // synchronously, and this ordering is what lets that callback move us to
    // `held` and have it stick.
    this.#state = { kind: 'acquiring', lease, promise };

    const granted = locks.request(
      RUNTIME_LOCK_NAME,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          this.#state = { kind: 'idle' };
          rejectLease(
            new WavelengthError(
              'The wallet is already open in another tab or window. Close ' +
                'it there and try again.',
              'wallet_locked',
            ),
          );

          return;
        }

        // Hold the lock by keeping the callback's promise pending until
        // release(); the Web Locks API frees the lock when it settles.
        const held = new Promise<void>((release) => {
          this.#state = { kind: 'held', lease, release };
        });
        resolveLease(lease);

        return held;
      },
    );
    // Keep the raw request promise so releaseAndSettle can see it settle (or,
    // if the invariant ever breaks, reject after the grant).
    this.#granted = granted;
    // request() itself can reject (e.g. the document is shutting down) before a
    // grant arrives; surface that as a coded acquire error. A rejection after
    // the grant is left for releaseAndSettle to warn about, not swallowed here.
    void granted.catch((err: unknown) => {
      if (this.#state.kind === 'acquiring' && this.#state.lease === lease) {
        this.#state = { kind: 'idle' };
        rejectLease(
          new WavelengthError(
            `The wallet runtime lock could not be acquired: ${errorMessage(err)}`,
            'runtime_lock_unavailable',
            { cause: err },
          ),
        );
      }
    });

    return promise;
  }

  /**
   * Releases the lock held under `lease` and resolves once the browser has
   * actually freed it. A no-op when `lease` no longer owns the grant (a newer
   * acquire has taken over) or nothing is held, so a release from a superseded
   * session cannot free a lock a live one depends on. Reentrant: a second
   * release while one is settling rides the same settle rather than reporting
   * the lock free early.
   *
   * Asking for a release only settles the promise the holder handed the Web
   * Locks API; the lock becomes available to another context a turn later. Use
   * this wherever the caller is about to tell someone the wallet is free.
   */
  async releaseAndSettle(lease: RuntimeLockLease): Promise<void> {
    const state = this.#state;

    if (state.kind === 'settling') {
      // Already settling: a duplicate release rides the in-flight one.
      return state.settle;
    }

    if (state.kind === 'acquiring') {
      // The grant has not arrived, so there is nothing to release yet. Callers
      // acquire the lease before they can release it (they await acquire()),
      // so a disposal mid-acquire is handled by releasing after the grant
      // lands, not here.
      return;
    }

    if (state.kind !== 'held' || state.lease !== lease) {
      // Stale lease, or nothing held: inert.
      return;
    }

    state.release();
    const granted = this.#granted;
    this.#granted = null;
    // acquire() keeps this from rejecting: its callback never throws, and the
    // one rejection path (request() itself failing) is caught there. If that
    // ever changes, a swallowed rejection here would report a still-held lock
    // as free, the cross-tab corruption this guards against, so surface it on
    // both channels rather than losing it.
    const settle = Promise.resolve(granted).then(
      () => undefined,
      (err: unknown) => {
        const message =
          'the wallet runtime lock release did not settle cleanly; another ' +
          `tab may see the wallet as free while it is still held: ${errorMessage(err)}`;
        this.#onWarn?.(message);
        console.warn(message, err);
      },
    );
    this.#state = { kind: 'settling', settle };
    try {
      await settle;
    } finally {
      if (this.#state.kind === 'settling' && this.#state.settle === settle) {
        this.#state = { kind: 'idle' };
      }
    }
  }
}
