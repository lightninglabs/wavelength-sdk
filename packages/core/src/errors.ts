/**
 * A stable, machine-readable classification on {@link WavelengthError} so consumers
 * can branch without string-matching the message. The SDK's own failures use the
 * named codes; daemon-originated errors currently fall back to `'walletdk_error'`
 * (a richer daemon-code mapping is planned). The `(string & {})` arm keeps the
 * union open for forward compatibility while still offering autocomplete on the
 * known codes.
 */
export type WavelengthErrorCode =
  | 'walletdk_error'
  | 'runtime_not_ready'
  | 'asset_load_failed'
  | 'worker_error'
  | (string & {});

/**
 * The error type thrown by the SDK. Carries a machine-readable {@link code} so
 * consumers can branch without string-matching the message.
 */
export class WavelengthError extends Error {
  /** The machine-readable error classification. */
  readonly code: WavelengthErrorCode;

  /**
   * @param message - The human-readable error message.
   * @param code - The machine-readable error classification; defaults to `'walletdk_error'`.
   * @param options - Standard error options; pass `{ cause }` to retain the underlying error for debugging.
   */
  constructor(
    message: string,
    code: WavelengthErrorCode = 'walletdk_error',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'WavelengthError';
    // Assigned explicitly rather than via a constructor parameter property,
    // which node's strip-only TypeScript loader (used by the unit tests) does
    // not support.
    this.code = code;
  }
}

/**
 * Extracts a human-readable message from an unknown thrown value. Tries in order:
 * an Error's message, a string value as-is, a .message property on plain objects,
 * and finally JSON serialization of anything else.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }

  // Duck-typed error-like objects from across serialization boundaries read
  // better as their message than as JSON.
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as Record<string, unknown>).message === 'string'
  ) {
    return (err as Record<string, unknown>).message as string;
  }

  try {
    return JSON.stringify(err);
  } catch {
    // JSON.stringify throws on circular structures or BigInt; fall back to a
    // plain string so the error path never throws a new error.
    return String(err);
  }
}

/**
 * Thrown by passkey ceremonies when the user dismisses the OS prompt, so hosts
 * can suppress cancellation copy without string matching. The React binding's
 * useWalletPasskey rethrows it without recording it as an error.
 */
export class PasskeyCancelledError extends Error {
  constructor(message = 'passkey ceremony was cancelled') {
    super(message);
    this.name = 'PasskeyCancelledError';
  }
}

/**
 * Reports whether `err` is a passkey cancellation. Checks `instanceof
 * PasskeyCancelledError` first, then falls back to matching `err.name` on any
 * Error: a duplicate copy of core (a second bundled instance of this package,
 * for example one pulled in by a transport with its own dependency graph)
 * produces a `PasskeyCancelledError` that fails `instanceof` across the
 * bundle boundary even though it is functionally the same error, and the name
 * check still recognizes it.
 */
export function isPasskeyCancelled(err: unknown): boolean {
  return err instanceof PasskeyCancelledError || (err instanceof Error && err.name === 'PasskeyCancelledError');
}

/**
 * Normalizes an unknown thrown value to an Error, preserving an existing
 * instance (and therefore its stack and cause) unchanged.
 */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(errorMessage(value));
}
