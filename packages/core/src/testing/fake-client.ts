// A deterministic in-memory WavelengthClient for engine and hook tests, modeled
// on core/base-client.test.ts's FakeClient but implementing the interface
// directly: the engine needs subscribe/startActivity/ready, not just callFacade.
//
// It records every call, replays canned per-method results (resolve or reject),
// and exposes a real subscribe registry so a test can `emit` runtime events
// (runtimeReady, runtimeStopped, activity, activityStream, log). `ready()` and
// `startActivity()` are separately controllable so the readiness and
// activity-stream backoff paths can be driven step by step.
import type {
  Balance,
  CreateWalletRequest,
  CreateWalletResult,
  DepositRequest,
  DepositResult,
  ExitRequest,
  ExitResult,
  ExitStatusRequest,
  ExitStatusResult,
  ExitSummaryRequest,
  ExitSummaryResult,
  FacadeMethod,
  GetExitPlanRequest,
  GetExitPlanResult,
  ListRequest,
  ListResult,
  OpenWalletFromPasskeyRequest,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveRequest,
  ReceiveResult,
  RuntimeConfig,
  SendRequest,
  SendResult,
  SweepWalletRequest,
  SweepWalletResult,
  UnlockWalletRequest,
  UnlockWalletResult,
  WavelengthClient,
  WavelengthEvent,
  WavelengthListener,
  WalletInfo,
  WalletStatus,
} from '../index.ts';

// A promise with its resolve/reject pulled out, for controlling ready() and
// per-call timing from a test.
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// A recorded invocation of a client method.
export type RecordedCall = { method: string; args: unknown[] };

/**
 * A hand-rolled WavelengthClient fake. Configure per-method results via the setter
 * helpers, drive lifecycle with resolveReady/rejectReady and emit, and read back
 * what the engine and hook tests called through `calls`.
 */
export class FakeWavelengthClient implements WavelengthClient {
  /** Every method invocation in order, for asserting what the engine and hook tests called. */
  readonly calls: RecordedCall[] = [];

  private readonly listeners = new Set<WavelengthListener>();

  // Per-method override: a function producing the result (or a rejection). When
  // absent, the method returns the sensible default below.
  private readonly overrides = new Map<string, (args: unknown[]) => unknown>();

  private readyDeferred = deferred<void>();

  // startActivity resolves by default; a test can install behavior keyed by the
  // call index (0-based) to fail specific reopen attempts.
  private startActivityCount = 0;
  startActivityImpl?: (callIndex: number) => Promise<void>;

  /** The info returned by getInfo()/start() unless overridden. Tests mutate this. */
  info: WalletInfo = {
    walletState: 'ready',
    walletReady: true,
  } as WalletInfo;

  /** The balance returned by balance() unless overridden. */
  balanceValue: Balance = {} as Balance;

  /** The list result returned by list() unless overridden. */
  listValue: ListResult = { activity: { entries: [] } } as ListResult;

  // Installs an override that resolves with `value` for `method`.
  stub(method: string, value: unknown): this {
    this.overrides.set(method, () => value);

    return this;
  }

  // Installs an override that rejects with `error` for `method`.
  fail(method: string, error: unknown): this {
    this.overrides.set(method, () => {
      throw error;
    });

    return this;
  }

  // Installs an arbitrary implementation (sync or async) for `method`.
  impl(method: string, fn: (args: unknown[]) => unknown): this {
    this.overrides.set(method, fn);

    return this;
  }

  // Resolves the pending ready() promise (or arms it so a later ready() resolves).
  resolveReady(): void {
    this.readyDeferred.resolve();
  }

  // Rejects the pending ready() promise with `error`.
  rejectReady(error: unknown): void {
    this.readyDeferred.reject(error);
  }

  /** Delivers a runtime event to every current subscriber. */
  emit(event: WavelengthEvent): void {
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  /** The number of live subscribers, for asserting subscribe/unsubscribe. */
  listenerCount(): number {
    return this.listeners.size;
  }

  // Records the call and runs an override if one exists; otherwise returns the
  // supplied default. Overrides that throw surface as a rejected promise.
  private run<T>(method: string, args: unknown[], fallback: () => T): Promise<T> {
    this.calls.push({ method, args });
    const override = this.overrides.get(method);
    try {
      const value = override ? (override(args) as T) : fallback();

      return Promise.resolve(value);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  ready(): Promise<void> {
    return this.readyDeferred.promise;
  }

  start(config: RuntimeConfig): Promise<WalletInfo> {
    return this.run('start', [config], () => this.info);
  }

  stop(): Promise<void> {
    return this.run('stop', [], () => undefined);
  }

  getInfo(): Promise<WalletInfo> {
    return this.run('getInfo', [], () => this.info);
  }

  status(): Promise<WalletStatus> {
    return this.run('status', [], () => ({}) as WalletStatus);
  }

  balance(): Promise<Balance> {
    return this.run('balance', [], () => this.balanceValue);
  }

  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult> {
    return this.run('createWallet', [req], () =>
      ({ identityPubKey: 'pk-create' }) as CreateWalletResult,
    );
  }

  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult> {
    return this.run('unlockWallet', [req], () =>
      ({ identityPubKey: 'pk-unlock' }) as UnlockWalletResult,
    );
  }

  openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult> {
    return this.run('openWalletFromPasskey', [req], () =>
      ({ identityPubKey: 'pk-passkey' }) as OpenWalletFromPasskeyResult,
    );
  }

  deposit(req?: DepositRequest): Promise<DepositResult> {
    return this.run('deposit', [req], () => ({}) as DepositResult);
  }

  receive(req: ReceiveRequest): Promise<ReceiveResult> {
    return this.run('receive', [req], () => ({}) as ReceiveResult);
  }

  prepareSend(req: SendRequest): Promise<PrepareSendResult> {
    return this.run('prepareSend', [req], () => ({}) as PrepareSendResult);
  }

  sendPrepared(prepared: PrepareSendResult): Promise<SendResult> {
    return this.run('sendPrepared', [prepared], () => ({}) as SendResult);
  }

  send(req: SendRequest): Promise<SendResult> {
    return this.run('send', [req], () => ({}) as SendResult);
  }

  list(req?: ListRequest): Promise<ListResult> {
    return this.run('list', [req], () => this.listValue);
  }

  exit(req: ExitRequest): Promise<ExitResult> {
    return this.run('exit', [req], () => ({}) as ExitResult);
  }

  exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult> {
    return this.run('exitStatus', [req], () => ({}) as ExitStatusResult);
  }

  exitSummary(req: ExitSummaryRequest = {}): Promise<ExitSummaryResult> {
    return this.run('exitSummary', [req], () => ({}) as ExitSummaryResult);
  }

  getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult> {
    return this.run('getExitPlan', [req], () => ({}) as GetExitPlanResult);
  }

  sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult> {
    return this.run('sweepWallet', [req], () => ({}) as SweepWalletResult);
  }

  callFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T> {
    return this.run('callFacade', [method, params], () => ({}) as T);
  }

  isRunning(): Promise<boolean> {
    return this.run('isRunning', [], () => false);
  }

  subscribe(listener: WavelengthListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  startActivity(opts?: { includeExisting?: boolean }): Promise<void> {
    const callIndex = this.startActivityCount++;
    this.calls.push({ method: 'startActivity', args: [opts] });
    if (this.startActivityImpl) {
      return this.startActivityImpl(callIndex);
    }

    return Promise.resolve();
  }

  stopActivity(): void {
    this.calls.push({ method: 'stopActivity', args: [] });
  }

  dispose(): void {
    this.calls.push({ method: 'dispose', args: [] });
    this.listeners.clear();
  }

  /** Count of calls to `method`, a convenience over filtering `calls`. */
  countOf(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}
