import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
import {
  PasskeyCancelledError,
  type PasskeyCeremony,
} from "@lightninglabs/wavelength-core";
import { createTestEngine } from "./testing/engine";
import { flushMicrotasks, renderWithEngine } from "./testing/render";
import { useWalletPasskey } from "./useWalletPasskey";

function stubCeremony(overrides: Partial<PasskeyCeremony> = {}): PasskeyCeremony {
  return {
    supportsPasskeyPrf: async () => true,
    registerPasskeyWallet: async () => ({ prfOutput: "aa".repeat(32), credentialId: "cred-1" }),
    assertPasskeyPrf: async () => ({ prfOutput: "bb".repeat(32), credentialId: "cred-2" }),
    ...overrides,
  };
}

describe("useWalletPasskey", () => {
  it("create opens the wallet and returns the outcome", async () => {
    const { client, engine } = createTestEngine();
    const { result } = renderWithEngine(engine, () =>
      useWalletPasskey(stubCeremony()),
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.create("App");
      await flushMicrotasks();
    });
    assert.equal((outcome as { credentialId: string }).credentialId, "cred-1");
    assert.equal(client.countOf("openWalletFromPasskey"), 1);
    assert.equal(result.current.createError, null);
  });

  it("create and open track pending/error separately", async () => {
    const { engine } = createTestEngine();
    const ceremony = stubCeremony({
      assertPasskeyPrf: async () => {
        throw new Error("no credential");
      },
    });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await result.current.open().catch(() => undefined);
      await flushMicrotasks();
    });
    assert.equal(result.current.openError?.message, "no credential");
    assert.equal(result.current.createError, null);
  });

  it("a cancelled ceremony rejects but records no error", async () => {
    const { engine } = createTestEngine();
    const ceremony = stubCeremony({
      registerPasskeyWallet: async () => {
        throw new PasskeyCancelledError();
      },
    });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create("App");
      } catch (err) {
        thrown = err;
      }
      await flushMicrotasks();
    });
    assert.ok(thrown instanceof PasskeyCancelledError);
    assert.equal(result.current.createError, null);
    assert.equal(result.current.createPending, false);
  });

  it("a same-named cross-realm cancellation rejects but records no error", async () => {
    const { engine } = createTestEngine();
    // Simulates a duplicate copy of core (e.g. two resolved package
    // versions): the error is not `instanceof PasskeyCancelledError` in this
    // realm, but carries the same `name`, which is the fallback signal
    // `isPasskeyCancelled` matches on.
    const crossRealmCancel = Object.assign(new Error("cancelled"), {
      name: "PasskeyCancelledError",
    });
    const ceremony = stubCeremony({
      registerPasskeyWallet: async () => {
        throw crossRealmCancel;
      },
    });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create("App");
      } catch (err) {
        thrown = err;
      }
      await flushMicrotasks();
    });
    assert.equal(thrown, crossRealmCancel);
    assert.equal(result.current.createError, null);
    assert.equal(result.current.createPending, false);
  });

  it("supported is null before the probe resolves", async () => {
    const { engine } = createTestEngine();
    let resolveProbe: (v: boolean) => void = () => undefined;
    const ceremony = stubCeremony({
      supportsPasskeyPrf: () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    assert.equal(result.current.supported, null);

    await act(async () => {
      resolveProbe(true);
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, true);
  });

  it("a rejecting support probe degrades to unsupported", async () => {
    const { engine } = createTestEngine();
    const ceremony = stubCeremony({
      supportsPasskeyPrf: async () => {
        throw new Error("probe failed");
      },
    });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, false);
  });

  it("a support probe resolving true sets supported to true", async () => {
    const { engine } = createTestEngine();
    const ceremony = stubCeremony({ supportsPasskeyPrf: async () => true });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, true);
  });

  it("a support probe resolving false sets supported to false", async () => {
    const { engine } = createTestEngine();
    const ceremony = stubCeremony({ supportsPasskeyPrf: async () => false });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, false);
  });

  it("open forwards the credential id to assertPasskeyPrf", async () => {
    const { engine } = createTestEngine();
    const assertPasskeyPrf = mock.fn(async () => ({
      prfOutput: "bb".repeat(32),
      credentialId: "cred-2",
    }));
    const ceremony = stubCeremony({ assertPasskeyPrf });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await result.current.open("cred-123");
      await flushMicrotasks();
    });
    assert.equal(assertPasskeyPrf.mock.calls[0].arguments[0], "cred-123");
  });

  it("create forwards the app name to registerPasskeyWallet", async () => {
    const { engine } = createTestEngine();
    const registerPasskeyWallet = mock.fn(async () => ({
      prfOutput: "aa".repeat(32),
      credentialId: "cred-1",
    }));
    const ceremony = stubCeremony({ registerPasskeyWallet });
    const { result } = renderWithEngine(engine, () => useWalletPasskey(ceremony));
    await act(async () => {
      await result.current.create("My App");
      await flushMicrotasks();
    });
    assert.equal(registerPasskeyWallet.mock.calls[0].arguments[0], "My App");
  });
});
