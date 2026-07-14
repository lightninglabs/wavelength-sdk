import {
  BaseWavelengthClient,
  WavelengthError,
  camelizeKeys,
  errorMessage,
} from '@lightninglabs/wavelength-core';
import type {
  ActivityStreamOptions,
  Entry,
  FacadeMethod,
  RuntimeConfig,
  WalletInfo,
} from '@lightninglabs/wavelength-core';

/**
 * The subset of the native Turbo Module the client depends on. Narrowed to an
 * interface (rather than the generated Spec) so unit tests can inject a fake
 * without loading react-native.
 */
export type WavelengthNativeModule = {
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
 * One 'wavelengthActivity' device event from the native side: an activity
 * entry, a clean end of stream, or a stream error.
 */
export type NativeActivityEvent = {
  /** The native pump's event kind. */
  kind: 'entry' | 'end' | 'error';
  /** The entry JSON for 'entry', the error message for 'error', else ''. */
  payload: string;
};

/**
 * Subscribes a listener to the native 'wavelengthActivity' events and
 * returns an unsubscribe function. The factory wires this to
 * NativeEventEmitter; unit tests supply their own.
 */
export type SubscribeToNativeEvents = (
  listener: (event: NativeActivityEvent) => void,
) => () => void;

/**
 * The React Native transport: implements {@link BaseWavelengthClient}'s pipe
 * over the gomobile Turbo Module. JSON strings cross the RN bridge and all
 * typing and casing normalization happens here in TS, mirroring how the web
 * transport treats the worker boundary.
 */
export class NativeWavelengthClient extends BaseWavelengthClient {
  // The embedded daemon runs natively, so it dials the servers over gRPC.
  protected readonly serverTransport = 'grpc' as const;

  private removeNativeListener: (() => void) | null = null;
  // Serializes start/stop native ops so a start always waits for a pending
  // stop's native close to finish before it subscribes.
  private opChain: Promise<void> = Promise.resolve();
  // Whether a native subscription is currently open. Only read and written
  // inside serialized ops, so it never races.
  private streamOpen = false;
  // Set inside a stop op so onNativeEvent knows the imminent native 'end' is
  // client-initiated and must be swallowed.
  private closing = false;
  private native: WavelengthNativeModule;
  private subscribeToNativeEvents: SubscribeToNativeEvents;

  constructor(
    native: WavelengthNativeModule,
    subscribeToNativeEvents: SubscribeToNativeEvents,
  ) {
    super();
    this.native = native;
    this.subscribeToNativeEvents = subscribeToNativeEvents;
  }

  // enqueue runs op after the previous op settles, whether it fulfilled or
  // rejected, so a rejected native call cannot stall the chain.
  private enqueue(op: () => Promise<void>): Promise<void> {
    const next = this.opChain.then(op, op);
    this.opChain = next;

    return next;
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

  protected async invokeFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    try {
      const resultJson = await this.native.call(
        method,
        JSON.stringify(params ?? {}),
      );

      return (resultJson ? JSON.parse(resultJson) : null) as T;
    } catch (err) {
      throw new WavelengthError(errorMessage(err), 'wavelength_error', {
        cause: err,
      });
    }
  }

  // startActivity opens the native pull subscription; the native side pumps
  // entries to 'wavelengthActivity' device events, which are re-emitted here
  // as typed 'activity' events. Idempotent while a stream is open.
  protected async openActivityStream(
    opts: ActivityStreamOptions,
  ): Promise<void> {
    return this.enqueue(async () => {
      if (this.streamOpen) {
        return;
      }
      this.closing = false;
      this.removeNativeListener ??= this.subscribeToNativeEvents((event) =>
        this.onNativeEvent(event),
      );
      await this.native.startActivity(
        JSON.stringify({
          includeExisting: opts.includeExisting ?? false,
          kinds: opts.kinds ?? [],
          cursor: opts.cursor ?? 0,
        }),
      );
      this.streamOpen = true;
    });
  }

  stopActivity(): void {
    void this.enqueue(async () => {
      if (!this.streamOpen) {
        return;
      }
      // Set closing before the native close so the terminal native 'end',
      // which arrives only after the close resolves, is recognized as
      // client-initiated and swallowed.
      this.closing = true;
      this.streamOpen = false;
      try {
        await this.native.stopActivity();
      } catch (err) {
        // A failed native close means the pump may still be running; surface
        // it instead of swallowing so a zombie stream is at least diagnosable.
        this.emit({
          type: 'log',
          payload: {
            level: 'warn',
            message: `failed to close the activity stream: ${errorMessage(err)}`,
          },
        });
      }
    });
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
          payload: {
            level: 'error',
            message: `dropped an unparseable activity entry: ${errorMessage(err)}`,
          },
        });

        return;
      }
      this.emit({ type: 'activity', payload: entry });

      return;
    }

    case 'end':
      // A client-initiated close is expected and silent; only an end the
      // consumer did not ask for is surfaced so it can resubscribe.
      this.streamOpen = false;
      if (!this.closing) {
        this.emit({ type: 'activityStream', payload: { state: 'ended' } });
      }

      return;

    case 'error':
      this.streamOpen = false;
      this.emit({
        type: 'activityStream',
        payload: { state: 'failed', message: event.payload },
      });

      return;

    default:
      this.emit({
        type: 'log',
        payload: {
          level: 'warn',
          message: `unknown wavelength native event: ${event.kind}`,
        },
      });
    }
  }

  dispose(): void {
    // super.dispose() calls stopActivity(), which enqueues the native close;
    // marking closing swallows the resulting terminal 'end'. Do not touch
    // streamOpen here: the enqueued stop reads it to decide whether to close
    // the native subscription, so clearing it now would leak the pump.
    this.closing = true;
    super.dispose();
    this.removeNativeListener?.();
    this.removeNativeListener = null;
  }
}
