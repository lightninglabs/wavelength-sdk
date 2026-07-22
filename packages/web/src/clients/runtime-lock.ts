import { WavelengthError } from '@lightninglabs/wavelength-core';

const RUNTIME_LOCK_NAME = 'lightninglabs:wavelength:worker-runtime';
const RUNTIME_LOCKED_MESSAGE =
  'This wallet is already open in another tab. Close the other tab and try again.';

type RuntimeLockLease = {
  release: () => void;
};

function clientDisposedError(): WavelengthError {
  return new WavelengthError('Wavelength client disposed', 'worker_error');
}

/**
 * Holds the worker runtime's origin-scoped Web Lock until its storage-owning
 * lifetime ends. The lock is intentionally not keyed by dataDir: the daemon
 * can open independently configured paths such as the swap database, plus
 * paths selected by daemon defaults.
 */
export class WorkerRuntimeLock {
  private lease: RuntimeLockLease | null = null;
  private priorRelease: Promise<void> = Promise.resolve();
  private rejectAcquisition: ((reason: unknown) => void) | null = null;
  private disposed = false;

  acquire(): Promise<boolean> {
    if (this.disposed) {
      return Promise.reject(clientDisposedError());
    }
    if (this.lease) {
      return Promise.resolve(false);
    }

    return this.acquireAfterPriorRelease();
  }

  release(): void {
    const lease = this.lease;
    this.lease = null;
    lease?.release();
  }

  dispose(): void {
    this.disposed = true;
    this.rejectAcquisition?.(clientDisposedError());
    this.release();
  }

  private async acquireAfterPriorRelease(): Promise<boolean> {
    await this.priorRelease;
    if (this.disposed) {
      throw clientDisposedError();
    }
    if (this.lease) {
      return false;
    }

    const lockManager = globalThis.navigator?.locks;
    if (!lockManager) {
      return false;
    }

    let releaseLease!: () => void;
    const holdLease = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    let resolveAvailability!: (available: boolean) => void;
    let rejectAvailability!: (reason: unknown) => void;
    const availability = new Promise<boolean>((resolve, reject) => {
      resolveAvailability = resolve;
      rejectAvailability = reject;
    });
    this.rejectAcquisition = rejectAvailability;

    let requestCompletion: Promise<unknown>;
    try {
      requestCompletion = lockManager.request(
        RUNTIME_LOCK_NAME,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (!lock) {
            resolveAvailability(false);

            return;
          }
          if (this.disposed) {
            rejectAvailability(clientDisposedError());

            return;
          }
          this.lease = { release: releaseLease };
          resolveAvailability(true);
          await holdLease;
        },
      );
    } catch (err) {
      this.rejectAcquisition = null;
      throw err;
    }

    this.priorRelease = requestCompletion.then(
      () => undefined,
      () => undefined,
    );
    void requestCompletion.catch(rejectAvailability);

    let available: boolean;
    try {
      available = await availability;
    } finally {
      if (this.rejectAcquisition === rejectAvailability) {
        this.rejectAcquisition = null;
      }
    }
    if (!available) {
      throw new WavelengthError(RUNTIME_LOCKED_MESSAGE, 'runtime_locked');
    }
    if (this.disposed) {
      this.release();
      throw clientDisposedError();
    }

    return true;
  }
}
