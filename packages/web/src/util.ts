import type {
  ActivityStreamPayload,
  WavelengthEvent,
  WavelengthEventType,
  WavelengthLogPayload,
} from '@lightninglabs/wavelength-core';
import { camelizeKeys } from '@lightninglabs/wavelength-core';
export { errorMessage } from '@lightninglabs/wavelength-core';

/**
 * A single in-flight RPC awaiting its worker response, keyed by request id in
 * the worker client's pending map. resolve/reject settle the promise the caller
 * received from callFacade when the matching worker message arrives.
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

// Facade fields that carry wallet secrets, compared lowercased with
// underscores removed so the Go PascalCase, camelCase and snake_case wire
// shapes all match. wavewalletdk-worker.js cannot import this module and
// carries an identical copy; keep the two in sync.
const SECRET_FIELDS: ReadonlySet<string> = new Set([
  'walletpassword',
  'seedpassphrase',
  'mnemonic',
  'encipheredseed',
  'seedentropy',
  'prfoutput',
]);

const REDACTED = '[REDACTED]';

/**
 * Returns a copy of a facade request or result for opt-in transport debug
 * logs, with every secret field (wallet passwords, mnemonics, seed material,
 * passkey PRF output) replaced at any depth. Other fields are kept. The real
 * payload still crosses the private transport boundary.
 */
export function facadeDebugPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map(facadeDebugPayload);
  }
  // Checked by tag rather than prototype so objects from another realm
  // (a structured clone, a vm context) are still walked.
  if (Object.prototype.toString.call(payload) !== '[object Object]') {
    return payload;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as object)) {
    const secret = SECRET_FIELDS.has(key.toLowerCase().replaceAll('_', ''));
    out[key] = secret && value != null ? REDACTED : facadeDebugPayload(value);
  }

  return out;
}

/**
 * Maps a non-activity event forwarded across the worker boundary onto the
 * typed {@link WavelengthEvent} union. Activity entries are normalized by the
 * client instance at the shared core boundary.
 */
export function toWavelengthEvent(raw: {
  type: WavelengthEventType;
  payload?: unknown;
}): WavelengthEvent {
  switch (raw.type) {
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
      payload: camelizeKeys<WavelengthLogPayload>(raw.payload),
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
      payload: { level: 'warn', message: `unknown Wavelength event: ${raw.type}` },
    };
  }
}
