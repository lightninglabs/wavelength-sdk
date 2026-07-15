// Renders a hook inside a WalletDKProvider wired to a WalletEngine, the
// common setup for every hook test. The wrapper is built with createElement
// rather than JSX so the test files stay plain .ts.
import { createElement, type ReactNode } from "react";
import { renderHook, type RenderHookResult } from "@testing-library/react";
import type { WalletEngine } from "@lightninglabs/wavelength-core";
import { WalletDKProvider } from "../provider.tsx";

/**
 * Renders `hook` under a provider bound to `engine` and returns the standard
 * testing-library result (`result.current` is the hook's latest return).
 */
export function renderWithEngine<T>(
  engine: WalletEngine,
  hook: () => T,
): RenderHookResult<T, unknown> {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(WalletDKProvider, { engine }, children),
  });
}

// Awaits a handful of microtask turns so a settled promise chain drains
// without leaning on real timers.
export async function flushMicrotasks(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
