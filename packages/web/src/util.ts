import {
  ActivityStreamPayload,
  camelizeKeys,
  Entry,
  WalletDKEvent,
  WalletDKEventType,
  WalletDKLogPayload,
} from '@lightninglabs/walletdk-core';
export { errorMessage } from '@lightninglabs/walletdk-core';

/**
 * A single in-flight RPC awaiting its worker response, keyed by request id in
 * the worker client's pending map. resolve/reject settle the promise the caller
 * received from callRaw when the matching worker message arrives.
 */
export type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * The pull-based subscription the wasm bridge's `subscribe` verb resolves to:
 * next() yields the next activity entry (or null at end of stream) and close()
 * cancels it.
 */
export type ActivityHandle = {
  next: () => Promise<unknown>;
  close: () => unknown;
};

/**
 * Formats the current time as "YYYY-MM-DD HH:MM:SS" to prefix debug logs.
 */
export function debugTs(): string {
  return new Date().toISOString().split('T').join(' ').slice(0, -1);
}

/**
 * Maps a raw event forwarded across the worker boundary onto the typed
 * {@link WalletDKEvent} union, camelizing the payloads that carry daemon JSON.
 * The postMessage boundary is untyped, so the mapping is explicit per
 * discriminant.
 */
export function toWalletDKEvent(raw: {
  type: WalletDKEventType;
  payload?: unknown;
}): WalletDKEvent {
  switch (raw.type) {
  case 'activity':
    return { type: 'activity', payload: camelizeKeys<Entry>(raw.payload) };

  case 'activityStream':
    // The payload is a plain state/message object, not daemon JSON, so it
    // crosses the worker boundary as-is with no camelizing.
    return {
      type: 'activityStream',
      payload: raw.payload as ActivityStreamPayload,
    };

  case 'log':
    return {
      type: 'log',
      payload: camelizeKeys<WalletDKLogPayload>(raw.payload),
    };

  case 'runtimeStopped':
    return { type: 'runtimeStopped' };

  case 'runtimeReady':
    return { type: 'runtimeReady' };

  default:
    // The postMessage boundary is untyped; surface an unexpected event as a
    // warning instead of silently advancing lifecycle state to runtimeReady.
    return {
      type: 'log',
      payload: { level: 'warn', message: `unknown walletdk event: ${raw.type}` },
    };
  }
}
