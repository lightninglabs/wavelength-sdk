import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "@testing-library/react";
import { createTestEngine } from "./testing/engine.ts";
import { renderWithEngine } from "./testing/render.ts";
import { useWalletEngine } from "./provider.tsx";
import { useWallet } from "./hooks.ts";

describe("WavelengthProvider", () => {
  it("provides the engine to useWalletEngine", () => {
    const { engine } = createTestEngine();
    const { result } = renderWithEngine(engine, () => useWalletEngine());
    assert.equal(result.current, engine);
  });

  it("useWalletEngine throws outside a provider", () => {
    assert.throws(() => renderHook(() => useWalletEngine()));
  });

  it("useWallet reads the initial phase", () => {
    const { engine } = createTestEngine();
    const { result } = renderWithEngine(engine, () => useWallet());
    assert.equal(result.current.phase, "loading");
    assert.equal(result.current.error, null);
  });
});
