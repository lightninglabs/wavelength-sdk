// Renders a hook inside a WalletDKProvider wired to a FakeWalletDKClient, the
// common setup for every provider/hook test. The wrapper is built with
// createElement rather than JSX so the test files stay plain .ts.
import { createElement, type ReactNode } from "react";
import { renderHook, type RenderHookResult } from "@testing-library/react";
import type { WalletDKClient } from "@lightninglabs/walletdk-core";
import { WalletDKProvider } from "../provider.tsx";

/**
 * Renders `hook` under a provider bound to `client` and returns the standard
 * testing-library result (`result.current` is the hook's latest return).
 */
export function renderWithProvider<T>(
  client: WalletDKClient,
  hook: () => T,
): RenderHookResult<T, unknown> {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(WalletDKProvider, { client }, children),
  });
}

// Awaits a handful of microtask turns so a settled promise chain (getInfo ->
// balance -> list in refresh, for example) drains without leaning on real
// timers. mock.timers replaces setTimeout/setInterval but leaves microtasks
// alone, so this flushes them between timer ticks.
export async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
