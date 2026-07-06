// errorMessage normalizes an unknown thrown value into a display string. It is
// called from catch blocks, so it must never throw itself: a failure here
// would swallow the very error it is reporting.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // A message-less Error stringifies to "{}" (its fields are
    // non-enumerable), so fall back to the cause message, then the name.
    if (err.message) {
      return err.message;
    }
    if (err.cause instanceof Error && err.cause.message) {
      return err.cause.message;
    }

    return err.name || "Unknown error.";
  }

  if (typeof err === "string") {
    return err;
  }

  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    // JSON.stringify throws on circular structures or BigInt; fall back to a
    // plain string so the error path never throws a new error.
    return String(err);
  }
}
