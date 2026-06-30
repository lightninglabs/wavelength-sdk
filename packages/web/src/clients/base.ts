import {
  Balance,
  CreateWalletRequest,
  CreateWalletResult,
  DepositRequest,
  DepositResult,
  ExitRequest,
  ExitResult,
  ExitStatusRequest,
  ExitStatusResult,
  GetExitPlanRequest,
  GetExitPlanResult,
  SweepWalletRequest,
  SweepWalletResult,
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
  UnlockWalletRequest,
  UnlockWalletResult,
  WalletDKClient,
  WalletDKEvent,
  WalletDKListener,
  WalletInfo,
  WalletStatus,
  normalizeInfo,
} from '@lightninglabs/walletdk-core';
import {
  toGoCreateWalletReq,
  toGoUnlockWalletReq,
  toMobileConfig,
} from '../mobile-config';

/**
 * Implements the transport-agnostic half of {@link WalletDKClient}: every RPC
 * verb is expressed in terms of the abstract callRaw, so the main-thread and
 * worker transports differ only in callRaw, ready, and the activity-stream
 * plumbing. The shared subscribe/emit listener machinery lives here too. Each
 * verb was previously duplicated across both clients; keeping them in one place
 * means a new RPC is added once.
 */
export abstract class BaseWalletDKClient implements WalletDKClient {
  protected readonly listeners = new Set<WalletDKListener>();

  // Transport hooks the concrete clients implement.
  abstract ready(): Promise<void>;
  abstract callRaw<T = unknown>(method: string, params?: unknown): Promise<T>;
  abstract startActivity(opts?: { includeExisting?: boolean }): Promise<void>;
  abstract stopActivity(): void;

  // start boots the embedded daemon and returns the post-boot WalletInfo. The
  // wasm bridge's start verb resolves null (it only calls mobile.Start), so the
  // client fetches getInfo afterwards; the old bridge returned info inline and
  // the React provider derives the runtime phase from it.
  async start(config: RuntimeConfig): Promise<WalletInfo> {
    await this.callRaw('start', toMobileConfig(config));

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
    // walletdkrpc.Balance: confirmed_sat (spendable VTXO), pending_in_sat,
    // pending_out_sat, same surface as darepocli balance.
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
      listener(event);
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
