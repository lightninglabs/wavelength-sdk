import {
  BaseWalletDKClient,
  WalletDKError,
  camelizeKeys,
  errorMessage,
} from '@lightninglabs/walletdk-core';
import type {
  Entry,
  RuntimeConfig,
  WalletInfo,
} from '@lightninglabs/walletdk-core';

/**
 * The subset of the native Turbo Module the client depends on. Narrowed to an
 * interface (rather than the generated Spec) so unit tests can inject a fake
 * without loading react-native.
 */
export type WalletdkNativeModule = {
  /** Invokes a facade verb by name with a JSON payload, returning JSON. */
  call(method: string, paramsJson: string): Promise<string>;
  /** Opens the native activity subscription. */
  startActivity(reqJson: string): Promise<void>;
  /** Closes the native activity subscription. */
  stopActivity(): Promise<void>;
  /** Resolves the platform default wallet data directory. */
  getDefaultDataDir(): Promise<string>;
};

/**
 * One 'walletdkActivity' device event from the native side: an activity
 * entry, a clean end of stream, or a stream error.
 */
export type NativeActivityEvent = {
  /** 'entry', 'end', or 'error'. */
  kind: string;
  /** The entry JSON for 'entry', the error message for 'error', else ''. */
  payload: string;
};

/**
 * Subscribes a listener to the native 'walletdkActivity' events and returns
 * an unsubscribe function. The factory wires this to NativeEventEmitter; unit
 * tests supply their own.
 */
export type SubscribeToNativeEvents = (
  listener: (event: NativeActivityEvent) => void,
) => () => void;

/**
 * The React Native transport: implements {@link BaseWalletDKClient}'s pipe
 * over the gomobile Turbo Module. JSON strings cross the RN bridge and all
 * typing and casing normalization happens here in TS, mirroring how the web
 * transport treats the worker boundary.
 */
export class NativeWalletDKClient extends BaseWalletDKClient {
  // The embedded daemon runs natively, so it dials the servers over gRPC.
  protected readonly serverTransport = 'grpc' as const;

  private removeNativeListener: (() => void) | null = null;
  private activityOpen = false;
  private native: WalletdkNativeModule;
  private subscribeToNativeEvents: SubscribeToNativeEvents;

  constructor(
    native: WalletdkNativeModule,
    subscribeToNativeEvents: SubscribeToNativeEvents,
  ) {
    super();
    this.native = native;
    this.subscribeToNativeEvents = subscribeToNativeEvents;
  }

  // The runtime is compiled into the app binary, so there is nothing to load.
  ready(): Promise<void> {
    return Promise.resolve();
  }

  // start fills in the platform default data directory when the caller did
  // not choose one; only the native side knows the app's sandbox paths.
  override async start(config: RuntimeConfig): Promise<WalletInfo> {
    return super.start({
      ...config,
      dataDir: config.dataDir ?? (await this.native.getDefaultDataDir()),
    });
  }

  async callRaw<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    try {
      const resultJson = await this.native.call(
        method,
        JSON.stringify(params ?? {}),
      );

      return camelizeKeys<T>(resultJson ? JSON.parse(resultJson) : null);
    } catch (err) {
      throw new WalletDKError(errorMessage(err), 'walletdk_error', {
        cause: err,
      });
    }
  }

  // startActivity opens the native pull subscription; the native side pumps
  // entries to 'walletdkActivity' device events, which are re-emitted here as
  // typed 'activity' events. Idempotent while a stream is open.
  async startActivity(opts: { includeExisting?: boolean } = {}): Promise<void> {
    if (this.activityOpen) {
      return;
    }
    this.removeNativeListener ??= this.subscribeToNativeEvents((event) =>
      this.onNativeEvent(event),
    );
    await this.native.startActivity(
      JSON.stringify({ includeExisting: opts.includeExisting ?? false }),
    );
    this.activityOpen = true;
  }

  stopActivity(): void {
    if (!this.activityOpen) {
      return;
    }
    this.activityOpen = false;
    void this.native.stopActivity().catch(() => undefined);
  }

  private onNativeEvent(event: NativeActivityEvent): void {
    switch (event.kind) {
    case 'entry': {
      let entry: Entry;
      try {
        entry = camelizeKeys<Entry>(JSON.parse(event.payload));
      } catch (err) {
        this.emit({
          type: 'log',
          payload: { level: 'error', message: errorMessage(err) },
        });

        return;
      }
      this.emit({ type: 'activity', payload: entry });

      return;
    }

    case 'end':
      // The stream ended cleanly (daemon stop or an intentional close); the
      // next startActivity call may reopen it.
      this.activityOpen = false;

      return;

    case 'error':
      this.activityOpen = false;
      this.emit({
        type: 'log',
        payload: { level: 'error', message: event.payload },
      });

      return;

    default:
      this.emit({
        type: 'log',
        payload: {
          level: 'warn',
          message: `unknown walletdk native event: ${event.kind}`,
        },
      });
    }
  }

  dispose(): void {
    super.dispose();
    this.removeNativeListener?.();
    this.removeNativeListener = null;
  }
}
