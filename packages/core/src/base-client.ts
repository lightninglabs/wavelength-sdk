import type {
  CreateWalletRequest,
  DepositRequest,
  ExitRequest,
  ExitStatusRequest,
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
import type { WalletDKClient } from './client.ts';
import type { WalletDKEvent, WalletDKListener } from './events.ts';
import type { WalletInfo, WalletStatus } from './state.ts';
import type { ServerTransport } from './facade.ts';
import { toGoCreateWalletReq, toGoUnlockWalletReq, toMobileConfig } from './facade.ts';
import { errorMessage } from './errors.ts';
import { normalizeInfo } from './state.ts';

/**
 * Implements the transport-agnostic half of {@link WalletDKClient}: every RPC
 * verb is expressed in terms of the abstract callRaw, so a transport (web
 * wasm, React Native gomobile, or a future one) supplies only the pipe:
 * callRaw, ready, the activity-stream plumbing, and its {@link ServerTransport}
 * flavor. The shared subscribe/emit listener machinery lives here too. Each
 * verb is defined once here, so a new RPC is added in exactly one place.
 */
export abstract class BaseWalletDKClient implements WalletDKClient {
  protected readonly listeners = new Set<WalletDKListener>();

  // Transport hooks the concrete clients implement.
  abstract ready(): Promise<void>;
  abstract callRaw<T = unknown>(method: string, params?: unknown): Promise<T>;
  abstract startActivity(opts?: { includeExisting?: boolean }): Promise<void>;
  abstract stopActivity(): void;
  /** How this transport's daemon dials the Ark and swap servers. */
  protected abstract readonly serverTransport: ServerTransport;

  // start boots the embedded daemon and returns the post-boot WalletInfo. The
  // facade's start verb resolves nothing useful on its own, so the client
  // fetches getInfo afterwards; the React provider derives the runtime phase
  // from it.
  async start(config: RuntimeConfig): Promise<WalletInfo> {
    await this.callRaw('start', toMobileConfig(config, this.serverTransport));

    return this.getInfo();
  }

  async stop(): Promise<void> {
    await this.callRaw('stop');
    this.emit({ type: 'runtimeStopped' });
  }

  async getInfo(): Promise<WalletInfo> {
    return normalizeInfo(await this.callRaw('getInfo'));
  }

  status(): Promise<WalletStatus> {
    return this.callRaw<WalletStatus>('status');
  }

  balance(): Promise<Balance> {
    // The daemon's Balance shape; generated.ts is the field source of truth.
    return this.callRaw<Balance>('balance');
  }

  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult> {
    return this.callRaw<CreateWalletResult>(
      'createWallet',
      toGoCreateWalletReq(req),
    );
  }

  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult> {
    return this.callRaw<UnlockWalletResult>(
      'unlockWallet',
      toGoUnlockWalletReq(req),
    );
  }

  openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult> {
    return this.callRaw<OpenWalletFromPasskeyResult>(
      'openWalletFromPasskey',
      req,
    );
  }

  deposit(req: DepositRequest = {}): Promise<DepositResult> {
    return this.callRaw<DepositResult>('deposit', req);
  }

  receive(req: ReceiveRequest): Promise<ReceiveResult> {
    return this.callRaw<ReceiveResult>('receive', req);
  }

  // prepareSend quotes a payment without dispatching it, returning the fee and a
  // single-use sendIntentId. Pair it with sendPrepared for a quote -> confirm ->
  // pay flow; send() folds the two steps into one.
  prepareSend(req: SendRequest): Promise<PrepareSendResult> {
    return this.callRaw<PrepareSendResult>('prepareSend', req);
  }

  // sendPrepared dispatches a payment quoted by prepareSend. It folds the
  // prepare-time paymentHash into the result so a two-step caller sees the same
  // shape send() returns (the daemon omits PaymentHash from sendPrepared).
  async sendPrepared(prepared: PrepareSendResult): Promise<SendResult> {
    const result = await this.callRaw<SendResult>('sendPrepared', {
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
    return this.callRaw<ListResult>('list', req);
  }

  exit(req: ExitRequest): Promise<ExitResult> {
    return this.callRaw<ExitResult>('exit', req);
  }

  exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult> {
    return this.callRaw<ExitStatusResult>('exitStatus', req);
  }

  getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult> {
    return this.callRaw<GetExitPlanResult>('getExitPlan', req);
  }

  sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult> {
    return this.callRaw<SweepWalletResult>('sweepWallet', req);
  }

  subscribe(listener: WalletDKListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(event: WalletDKEvent) {
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
