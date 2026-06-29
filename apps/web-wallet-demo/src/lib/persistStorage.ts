// requestPersistentStorage asks the browser to exempt this origin's storage
// from eviction. The wallet's SQLite databases live in OPFS, which browsers
// treat as best-effort by default: Safari's ITP clears script-writable storage
// after about seven idle days, which would silently drop the local wallet.
// Granting is heuristic and cannot be forced, so a denied or unsupported
// result is not an error; it is surfaced as a warning and ignored. The local
// wallet stays recoverable from its passkey or recovery phrase regardless.
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) {
    return;
  }

  try {
    // Skip the request once the origin is already persisted; persisted() does
    // not re-prompt and avoids a redundant grant check on every boot.
    if (await navigator.storage.persisted()) {
      return;
    }

    const granted = await navigator.storage.persist();
    if (!granted) {
      console.warn(
        "Persistent storage was not granted; OPFS wallet data may be " +
          "evicted under storage pressure or browser eviction policies.",
      );
    }
  } catch (err) {
    console.warn("requestPersistentStorage failed:", err);
  }
}
