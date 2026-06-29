import type { Entry } from './generated';

/**
 * The severity of a `'log'` event emitted by the runtime.
 */
export type WalletDKLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * The payload carried by a `'log'` event.
 */
export type WalletDKLogPayload = {
  /** The severity of the log line. */
  level: WalletDKLogLevel;
  /** The human-readable log message. */
  message: string;
};

/**
 * The discriminated union of runtime events delivered to subscribers. Narrow on
 * `type` to read the payload: `'activity'` carries the changed {@link Entry},
 * `'log'` carries a level and message, and the lifecycle events
 * (`'runtimeReady'`, `'runtimeStopped'`) carry none.
 */
export type WalletDKEvent =
  | { type: 'runtimeReady' }
  | { type: 'runtimeStopped' }
  | { type: 'activity'; payload: Entry }
  | { type: 'log'; payload: WalletDKLogPayload };

/**
 * The set of {@link WalletDKEvent} discriminants.
 */
export type WalletDKEventType = WalletDKEvent['type'];

/**
 * A subscriber callback invoked with each {@link WalletDKEvent}.
 */
export type WalletDKListener = (event: WalletDKEvent) => void;
