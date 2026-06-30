/**
 * A stable, machine-readable classification on {@link WalletDKError} so consumers
 * can branch without string-matching the message. The SDK's own failures use the
 * named codes; daemon-originated errors currently fall back to `'walletdk_error'`
 * (a richer daemon-code mapping is planned). The `(string & {})` arm keeps the
 * union open for forward compatibility while still offering autocomplete on the
 * known codes.
 */
export type WalletDKErrorCode =
  | 'walletdk_error'
  | 'runtime_not_ready'
  | 'asset_load_failed'
  | 'worker_error'
  | (string & {});

/**
 * The error type thrown by the SDK. Carries a machine-readable {@link code} so
 * consumers can branch without string-matching the message.
 */
export class WalletDKError extends Error {
  /**
   * @param message - The human-readable error message.
   * @param code - The machine-readable error classification; defaults to `'walletdk_error'`.
   * @param options - Standard error options; pass `{ cause }` to retain the underlying error for debugging.
   */
  constructor(
    message: string,
    public readonly code: WalletDKErrorCode = 'walletdk_error',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'WalletDKError';
  }
}
