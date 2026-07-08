/**
 * Returns `prev` when `next` encodes to the same JSON, so refresh fetches that
 * changed nothing keep the previous object identity and Object.is-based
 * subscribers (useSyncExternalStore) skip the re-render. JSON comparison is
 * acceptable at these payload sizes (activity is a bounded page).
 */
export function stabilize<T>(prev: T, next: T): T {
  if (prev === next || prev == null || next == null) {
    return next;
  }
  try {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
  } catch {
    return next;
  }
}
