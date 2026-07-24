import type {
  CreateWalletRequest,
  DepositRequest,
  ExitRequest,
  ExitStatusRequest,
  ExitSummaryRequest,
  GetExitPlanRequest,
  ListRequest,
  OpenWalletFromPasskeyRequest,
  ReceiveRequest,
  SendRequest,
  SweepWalletRequest,
  UnlockWalletRequest,
} from './requests.ts';
import type {
  Balance,
  CreateWalletResult,
  DepositResult,
  ExitResult,
  ExitStatusResult,
  ExitSummaryResult,
  GetExitPlanResult,
  ListResult,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveResult,
  SendResult,
  SweepWalletResult,
  UnlockWalletResult,
} from './results.ts';
import { validateRuntimeConfig, type RuntimeConfig } from './config.ts';
import type { WavelengthClient } from './client.ts';
import type { WavelengthEvent, WavelengthListener } from './events.ts';
import type { WalletInfo, WalletStatus } from './state.ts';
import type { FacadeMethod, ServerTransport } from './facade.ts';
import {
  assertFacadeMethod,
  toGoCreateWalletReq,
  toGoUnlockWalletReq,
  toMobileConfig,
} from './facade.ts';
import { WavelengthError, errorMessage } from './errors.ts';
import type { Entry } from './generated.ts';
import {
  normalizeEntry,
  normalizeFacadeResult,
} from './response-normalization.ts';
import {
  validateActivityStreamOptions,
  type ActivityStreamOptions,
} from './activity-options.ts';

/**
 * Implements the transport-agnostic half of {@link WavelengthClient}: every RPC
 * verb is expressed in terms of the abstract invokeFacade, so a transport (web
 * wasm, React Native gomobile, or a future one) supplies only the pipe:
 * invokeFacade, ready, the activity-stream plumbing, and its {@link ServerTransport}
 * flavor. The shared subscribe/emit listener machinery and typed wrappers live
 * here. The facade catalog, public contract, native dispatch, and response
 * normalization remain separate synchronization points.
 */
export abstract class BaseWavelengthClient implements WavelengthClient {
  protected readonly listeners = new Set<WavelengthListener>();

  // Serializes runtime lifecycle operations for transports that route start and
  // stop through enqueueLifecycle, so a host's overlapping calls (a double
  // click, a stop issued mid-start) run one at a time in invocation order
  // instead of interleaving at the transport's exclusive resources.
  #lifecycleTail: Promise<unknown> = Promise.resolve();

  // Transport hooks the concrete clients implement.
  abstract ready(): Promise<void>;
  protected abstract invokeFacade<T = unknown>(
    method: FacadeMethod,
    params?: unknown,
  ): Promise<T>;
  protected abstract openActivityStream(
    opts: ActivityStreamOptions,
  ): Promise<void>;
  abstract stopActivity(): void;
  /** How this transport's daemon dials the Ark and swap servers. */
  protected abstract readonly serverTransport: ServerTransport;

  // The raw facade escape hatch. It rejects the lifecycle verbs 'start' and
  // 'stop' so they can only run through the typed start()/stop(): those are
  // where the web transports take and release the cross-tab runtime lock, and a
  // raw call would bypass it. The typed methods dispatch through
  // callFacadeInternal, which carries no such guard.
  async callFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    if (method === 'start' || method === 'stop') {
      throw new WavelengthError(
        `Call ${method}() instead of callFacade('${method}'): the ${method} ` +
          'lifecycle verb runs through the typed method, which manages the ' +
          'cross-tab runtime lock.',
      );
    }

    return this.callFacadeInternal<T>(method, params);
  }

  // The unguarded facade dispatch behind callFacade. The typed lifecycle verbs
  // (start/stop) call this directly so callFacade's guard does not reject the
  // very verbs they exist to issue.
  protected async callFacadeInternal<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    assertFacadeMethod(method);
    const raw = await this.invokeFacade(method, params);

    return normalizeFacadeResult<T>(method, raw);
  }

  isRunning(): Promise<boolean> {
    return this.callFacade<boolean>('isRunning');
  }

  async startActivity(opts: ActivityStreamOptions = {}): Promise<void> {
    validateActivityStreamOptions(opts);
    await this.openActivityStream(opts);
  }

  /**
   * Runs a runtime lifecycle operation serialized against every other one on
   * this client, in invocation order. A transport that owns an exclusive
   * resource for the daemon's lifetime (the web transport's cross-tab runtime
   * lock) routes its start()/stop() through this so overlapping host calls
   * cannot interleave: two starts cannot share one lock lease, and a stop cannot
   * release the lock while a start is still opening the databases. A failed
   * operation does not poison the queue for the next caller.
   */
  protected enqueueLifecycle<T>(op: () => Promise<T>): Promise<T> {
    const run = this.#lifecycleTail.then(op, op);
    // The tail tracks only completion, never the value or a rejection.
    this.#lifecycleTail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  // start boots the embedded daemon and returns the post-boot WalletInfo. The
  // facade's start verb resolves nothing useful on its own, so the client
  // fetches getInfo afterwards; the React provider derives the runtime phase
  // from it.
  async start(config: RuntimeConfig): Promise<WalletInfo> {
    validateRuntimeConfig(config, this.serverTransport);
    await this.callFacadeInternal(
      'start',
      toMobileConfig(config, this.serverTransport),
    );

    return this.getInfo();
  }

  async stop(): Promise<void> {
    // Snapshot any per-session teardown token before the stop is issued, so
    // afterDaemonStopped acts on the session this stop belongs to even if a new
    // start takes over while the stop RPC is in flight.
    const token = this.beforeDaemonStop();
    await this.callFacadeInternal('stop');
    await this.afterDaemonStopped(token);
    this.emit({ type: 'runtimeStopped' });
  }

  /**
   * Called at the very start of a stop, before the daemon RPC, so a transport
   * can capture whatever identifies the session being stopped (the web
   * transport's runtime-lock lease). The value is handed back to
   * {@link afterDaemonStopped}. Default: nothing to capture.
   */
  protected beforeDaemonStop(): unknown {
    return undefined;
  }

  /**
   * Called once the daemon has acknowledged a stop and before subscribers are
   * told about it. A transport holding an exclusive resource for the daemon's
   * lifetime (the web transport's cross-tab runtime lock, say) releases it
   * here: the acknowledgement is the proof the daemon let its storage go, and
   * running before the event means a subscriber that restarts the runtime
   * cannot race the release. Not called when the stop call fails, because an
   * unacknowledged stop is no evidence the daemon is down.
   *
   * Receives the token {@link beforeDaemonStop} captured, so the release can be
   * scoped to the session this stop belongs to and a stop whose start has
   * already been superseded frees nothing. Awaited, so a transport whose
   * release only completes asynchronously (the Web Locks API frees a lock when
   * the holder's promise settles, not when it is asked to) can resolve once the
   * resource is genuinely free.
   */
  protected afterDaemonStopped(_token?: unknown): void | Promise<void> {}

  getInfo(): Promise<WalletInfo> {
    return this.callFacade<WalletInfo>('getInfo');
  }

  status(): Promise<WalletStatus> {
    return this.callFacade<WalletStatus>('status');
  }

  balance(): Promise<Balance> {
    // The daemon's Balance shape; generated.ts is the field source of truth.
    return this.callFacade<Balance>('balance');
  }

  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult> {
    return this.callFacade<CreateWalletResult>(
      'createWallet',
      toGoCreateWalletReq(req),
    );
  }

  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult> {
    return this.callFacade<UnlockWalletResult>(
      'unlockWallet',
      toGoUnlockWalletReq(req),
    );
  }

  openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult> {
    return this.callFacade<OpenWalletFromPasskeyResult>(
      'openWalletFromPasskey',
      req,
    );
  }

  deposit(req: DepositRequest = {}): Promise<DepositResult> {
    return this.callFacade<DepositResult>('deposit', req);
  }

  receive(req: ReceiveRequest): Promise<ReceiveResult> {
    return this.callFacade<ReceiveResult>('receive', req);
  }

  // prepareSend quotes a payment without dispatching it, returning the fee and a
  // single-use sendIntentId. Pair it with sendPrepared for a quote -> confirm ->
  // pay flow; send() folds the two steps into one.
  prepareSend(req: SendRequest): Promise<PrepareSendResult> {
    return this.callFacade<PrepareSendResult>('prepareSend', req);
  }

  // sendPrepared dispatches a payment quoted by prepareSend. It folds the
  // prepare-time paymentHash into the result so a two-step caller sees the same
  // shape send() returns (the daemon omits PaymentHash from sendPrepared).
  async sendPrepared(prepared: PrepareSendResult): Promise<SendResult> {
    const result = await this.callFacade<SendResult>('sendPrepared', {
      SendIntentID: prepared.sendIntentId,
    });

    return {
      ...result,
      paymentHash: result.paymentHash ?? prepared.paymentHash,
    };
  }

  // send composes prepareSend + sendPrepared into one call for the common
  // fire-and-forget path.
  async send(req: SendRequest): Promise<SendResult> {
    return this.sendPrepared(await this.prepareSend(req));
  }

  list(req: ListRequest = {}): Promise<ListResult> {
    return this.callFacade<ListResult>('list', req);
  }

  exit(req: ExitRequest): Promise<ExitResult> {
    return this.callFacade<ExitResult>('exit', req);
  }

  exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult> {
    return this.callFacade<ExitStatusResult>('exitStatus', req);
  }

  exitSummary(req: ExitSummaryRequest = {}): Promise<ExitSummaryResult> {
    return this.callFacade<ExitSummaryResult>('exitSummary', req);
  }

  getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult> {
    return this.callFacade<GetExitPlanResult>('getExitPlan', req);
  }

  sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult> {
    return this.callFacade<SweepWalletResult>('sweepWallet', req);
  }

  subscribe(listener: WavelengthListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(event: WavelengthEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // Isolate a throwing subscriber so it cannot suppress the others or
        // abort the transport's event dispatch. Reported as a log event
        // unless the log listener itself is the one that threw.
        if (event.type !== 'log') {
          this.emit({
            type: 'log',
            payload: { level: 'error', message: errorMessage(err) },
          });
        }
      }
    }
  }

  protected normalizeActivityEntry(raw: unknown): Entry {
    return normalizeEntry(raw);
  }

  /**
   * Closes the activity stream and unsubscribes all listeners. The concrete
   * transports override this to also tear down their runtime (terminate the
   * Worker, or drop the main-thread runtime listener).
   */
  dispose(): void {
    this.stopActivity();
    this.listeners.clear();
  }
}
