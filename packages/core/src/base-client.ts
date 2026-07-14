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
import type { RuntimeConfig } from './config.ts';
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
import { camelizeKeys } from './casing.ts';
import { errorMessage } from './errors.ts';
import { normalizeInfo } from './state.ts';
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

  async callFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    assertFacadeMethod(method);
    const raw = await this.invokeFacade(method, params);

    return camelizeKeys<T>(raw);
  }

  isRunning(): Promise<boolean> {
    return this.callFacade<boolean>('isRunning');
  }

  async startActivity(opts: ActivityStreamOptions = {}): Promise<void> {
    validateActivityStreamOptions(opts);
    await this.openActivityStream(opts);
  }

  // start boots the embedded daemon and returns the post-boot WalletInfo. The
  // facade's start verb resolves nothing useful on its own, so the client
  // fetches getInfo afterwards; the React provider derives the runtime phase
  // from it.
  async start(config: RuntimeConfig): Promise<WalletInfo> {
    await this.callFacade('start', toMobileConfig(config, this.serverTransport));

    return this.getInfo();
  }

  async stop(): Promise<void> {
    await this.callFacade('stop');
    this.emit({ type: 'runtimeStopped' });
  }

  async getInfo(): Promise<WalletInfo> {
    return normalizeInfo(await this.callFacade('getInfo'));
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
