import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WavelengthError } from '@lightninglabs/wavelength-core';
import {
  RuntimeLock,
  RUNTIME_LOCK_NAME,
  isWalletLockedMessage,
  isNearMissLockMessage,
} from './runtime-lock.ts';

type LockGrant = { name: string };

function stubNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
}

// A microtask/macrotask drain, to let the Web Locks callback plumbing settle.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// grantingLocks stubs navigator.locks with a lock that is always available.
// state.released flips true once the holder lets the grant's promise settle.
function grantingLocks() {
  const state = { released: false, requests: 0 };
  const locks = {
    request: (
      _name: string,
      _options: unknown,
      callback: (lock: LockGrant | null) => unknown,
    ) => {
      state.requests += 1;

      return Promise.resolve(callback({ name: RUNTIME_LOCK_NAME })).then(() => {
        state.released = true;
      });
    },
  };

  return { state, navigator: { locks } };
}

describe('RuntimeLock lease semantics', () => {
  it('frees the grant only for the lease that currently owns it', async () => {
    const locks = grantingLocks();
    stubNavigator(locks.navigator);
    try {
      const lock = new RuntimeLock();
      const first = await lock.acquire();
      // A second acquire while held (a stop-then-start overlap coalescing onto
      // the same grant) mints a newer lease that now owns the release.
      const second = await lock.acquire();
      assert.notEqual(first, second);

      // The older lease's release is inert: the grant a live session relies on
      // must not be freed by a superseded one. This is the core corruption
      // guard (a stale stop releasing a newer start's lock).
      await lock.releaseAndSettle(first);
      assert.equal(locks.state.released, false, 'a stale lease must not release');

      // The current lease frees it.
      await lock.releaseAndSettle(second);
      assert.equal(locks.state.released, true);
    } finally {
      stubNavigator(undefined);
    }
  });

  it('is a no-op to release a lease after the lock is already idle', async () => {
    const locks = grantingLocks();
    stubNavigator(locks.navigator);
    try {
      const lock = new RuntimeLock();
      const lease = await lock.acquire();
      await lock.releaseAndSettle(lease);
      // A duplicate release (a stop after a fatal already tore down) does
      // nothing rather than throwing or disturbing a later acquire.
      await lock.releaseAndSettle(lease);
      const next = await lock.acquire();
      assert.notEqual(next, lease);
      await lock.releaseAndSettle(next);
    } finally {
      stubNavigator(undefined);
    }
  });

  it('rejects a second context with wallet_locked', async () => {
    stubNavigator({
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: LockGrant | null) => unknown,
        ) => Promise.resolve(callback(null)),
      },
    });
    try {
      await assert.rejects(new RuntimeLock().acquire(), (err: unknown) => {
        assert.ok(err instanceof WavelengthError);
        assert.equal(err.code, 'wallet_locked');

        return true;
      });
    } finally {
      stubNavigator(undefined);
    }
  });

  it('wraps a rejecting locks.request in a coded WavelengthError', async () => {
    stubNavigator({
      locks: { request: () => Promise.reject(new Error('document is shutting down')) },
    });
    try {
      await assert.rejects(new RuntimeLock().acquire(), (err: unknown) => {
        assert.ok(err instanceof WavelengthError);
        assert.equal(err.code, 'runtime_lock_unavailable');
        assert.match(err.message, /document is shutting down/);

        return true;
      });
    } finally {
      stubNavigator(undefined);
    }
  });

  it('acquires without Web Locks and treats release as a no-op', async () => {
    stubNavigator(undefined);
    const lock = new RuntimeLock();
    const lease = await lock.acquire();
    assert.equal(typeof lease, 'number');
    // No grant to free, but release must still resolve and leave the lock
    // reusable.
    await lock.releaseAndSettle(lease);
    const next = await lock.acquire();
    assert.notEqual(next, lease);
  });

  it('makes a retry wait for an in-flight release instead of racing it', async () => {
    // Model the browser freeing the lock a turn late: the holder's release
    // resolves, then the request promise settles only after free() is called.
    const state = { released: false };
    let free!: () => void;
    stubNavigator({
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: LockGrant | null) => unknown,
        ) =>
          Promise.resolve(callback({ name: RUNTIME_LOCK_NAME })).then(
            () =>
              new Promise<void>((resolve) => {
                free = () => {
                  state.released = true;
                  resolve();
                };
              }),
          ),
      },
    });
    try {
      const lock = new RuntimeLock();
      const lease = await lock.acquire();
      const releasing = lock.releaseAndSettle(lease);

      // A retry issued while the release is still settling must not resolve
      // until the release completes.
      let acquired = false;
      const retry = lock.acquire().then((l) => {
        acquired = true;

        return l;
      });
      await settle();
      assert.equal(acquired, false, 'the retry waits for the release to settle');

      free();
      await releasing;
      const retryLease = await retry;
      assert.equal(acquired, true);
      assert.equal(typeof retryLease, 'number');
    } finally {
      stubNavigator(undefined);
    }
  });

  it('rides a single settlement when released twice before the browser frees', async () => {
    const state = { released: false };
    let free!: () => void;
    stubNavigator({
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: LockGrant | null) => unknown,
        ) =>
          Promise.resolve(callback({ name: RUNTIME_LOCK_NAME })).then(
            () =>
              new Promise<void>((resolve) => {
                free = () => {
                  state.released = true;
                  resolve();
                };
              }),
          ),
      },
    });
    try {
      const lock = new RuntimeLock();
      const lease = await lock.acquire();
      const first = lock.releaseAndSettle(lease);
      let secondDone = false;
      const second = lock.releaseAndSettle(lease).then(() => {
        secondDone = true;
      });
      await settle();
      // The second release must not report the lock free before the browser
      // actually frees it.
      assert.equal(secondDone, false);
      assert.equal(state.released, false);

      free();
      await Promise.all([first, second]);
      assert.equal(secondDone, true);
      assert.equal(state.released, true);
    } finally {
      stubNavigator(undefined);
    }
  });

  it('resolves releaseAndSettle only after the granted request settles', async () => {
    let requestSettled = false;
    stubNavigator({
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: LockGrant | null) => unknown,
        ) =>
          Promise.resolve().then(async () => {
            await callback({ name: RUNTIME_LOCK_NAME });
            requestSettled = true;
          }),
      },
    });
    try {
      const lock = new RuntimeLock();
      const lease = await lock.acquire();
      assert.equal(requestSettled, false, 'the lock is held until released');
      await lock.releaseAndSettle(lease);
      assert.equal(
        requestSettled,
        true,
        'releaseAndSettle must not resolve before the browser frees the lock',
      );
    } finally {
      stubNavigator(undefined);
    }
  });

  it('warns on both channels when a release does not settle cleanly', async () => {
    // A request whose promise rejects after the grant models the invariant
    // breaking; the release must surface it rather than swallow it.
    stubNavigator({
      locks: {
        request: (
          _name: string,
          _options: unknown,
          callback: (lock: LockGrant | null) => unknown,
        ) =>
          Promise.resolve(callback({ name: RUNTIME_LOCK_NAME })).then(() => {
            throw new Error('lock broke');
          }),
      },
    });
    const warns: string[] = [];
    const consoleWarnings: unknown[] = [];
    const savedWarn = console.warn;
    console.warn = (...args: unknown[]) => consoleWarnings.push(args[0]);
    try {
      const lock = new RuntimeLock({ onWarn: (m) => warns.push(m) });
      const lease = await lock.acquire();
      await lock.releaseAndSettle(lease);
      assert.ok(warns.some((m) => /did not settle cleanly/.test(m)));
      assert.ok(
        consoleWarnings.some(
          (m) => typeof m === 'string' && /did not settle cleanly/.test(m),
        ),
      );
    } finally {
      console.warn = savedWarn;
      stubNavigator(undefined);
    }
  });
});

describe('locked-message classification', () => {
  it('classifies cross-context contention as wallet_locked', () => {
    for (const message of [
      'unable to open database: database is locked',
      'SQLITE_BUSY: the database file is locked',
      'Access Handles cannot be created on this file',
    ]) {
      assert.equal(isWalletLockedMessage(message), true, message);
    }
  });

  it('excludes sole-tab lookalikes from wallet_locked', () => {
    for (const message of [
      'persistent storage required but not available',
      'database already open in this worker',
      'wallet is locked; unlock to continue',
    ]) {
      assert.equal(isWalletLockedMessage(message), false, message);
    }
  });

  it('flags an unclassified storage failure as a near miss', () => {
    assert.equal(isNearMissLockMessage('SQLITE_IOERR: disk I/O error'), true);
    assert.equal(isNearMissLockMessage('wallet is locked; unlock to continue'), false);
    assert.equal(isNearMissLockMessage('database is locked'), false);
  });
});
