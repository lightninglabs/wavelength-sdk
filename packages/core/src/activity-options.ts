import type { EntryKind } from './generated.ts';
import { WavelengthError } from './errors.ts';

/** Controls the wallet activity replay, filtering, and resume position. */
export type ActivityStreamOptions = {
  /** When true with a zero cursor, replays existing activity before live updates. */
  includeExisting?: boolean;
  /** Restricts updates to the selected activity kinds. */
  kinds?: EntryKind[];
  /**
   * Resumes after this monotonic activity cursor, replaying later events before
   * live updates. Must be a nonnegative safe integer.
   */
  cursor?: number;
};

export function validateActivityStreamOptions(
  opts: ActivityStreamOptions,
): void {
  if (
    opts.cursor !== undefined &&
    (!Number.isSafeInteger(opts.cursor) || opts.cursor < 0)
  ) {
    throw new WavelengthError(
      'activity cursor must be a nonnegative safe integer',
      'invalid_cursor',
    );
  }
}
