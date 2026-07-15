import type { Entry } from './generated.ts';

/**
 * The severity of a `'log'` event emitted by the runtime.
 */
export type WavelengthLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * The payload carried by a `'log'` event.
 */
export type WavelengthLogPayload = {
  /** The severity of the log line. */
  level: WavelengthLogLevel;
  /** The human-readable log message. */
  message: string;
};

/**
 * Whether an activity stream that the consumer did not close ended without an
 * error ('ended') or failed with one ('failed'). A client-initiated close
 * emits no event at all.
 */
export type ActivityStreamState = 'ended' | 'failed';

/**
 * The payload carried by an `'activityStream'` event. `message` is present
 * exactly when the stream failed, so narrowing on `state` yields it without a
 * null check.
 */
export type ActivityStreamPayload =
  | { state: 'ended' }
  | { state: 'failed'; message: string };

/**
 * The discriminated union of runtime events delivered to subscribers. Narrow on
 * `type` to read the payload: `'activity'` carries the changed {@link Entry},
 * `'log'` carries a level and message, and the lifecycle events
 * (`'runtimeReady'`, `'runtimeStopped'`) carry none. `'activityStream'` reports
 * that the activity subscription ended or failed for a reason the consumer did
 * not initiate.
 */
export type WavelengthEvent =
  | { type: 'runtimeReady' }
  | { type: 'runtimeStopped' }
  | { type: 'activity'; payload: Entry }
  | { type: 'activityStream'; payload: ActivityStreamPayload }
  | { type: 'log'; payload: WavelengthLogPayload };

/**
 * The set of {@link WavelengthEvent} discriminants.
 */
export type WavelengthEventType = WavelengthEvent['type'];

/**
 * A subscriber callback invoked with each {@link WavelengthEvent}.
 */
export type WavelengthListener = (event: WavelengthEvent) => void;
