import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { act, waitFor } from "@testing-library/react";
import type { PasskeyAssertion, PasskeyCeremony } from "@lightninglabs/walletdk-core";
import { usePasskeyWallet } from "./usePasskeyWallet.ts";
import { FakeWalletDKClient } from "./testing/fake-client.ts";
import { flushMicrotasks, renderWithProvider } from "./testing/render.ts";

// A configurable PasskeyCeremony fake: it records its calls and replays a canned
// assertion or a rejection, so the hook's success and failure paths are driven
// without any WebAuthn.
class FakeCeremony implements PasskeyCeremony {
  supported: boolean | Error = true;
  assertion: PasskeyAssertion = { prfOutput: "prf-hex", credentialId: "cred-1" };
  registerError?: Error;
  assertError?: Error;
  supportsCallCount = 0;
  readonly registerCalls: string[] = [];
  readonly assertCalls: Array<string | undefined> = [];

  supportsPasskeyPrf(): Promise<boolean> {
    this.supportsCallCount += 1;
    if (this.supported instanceof Error) {
      return Promise.reject(this.supported);
    }

    return Promise.resolve(this.supported);
  }

  registerPasskeyWallet(appName: string): Promise<PasskeyAssertion> {
    this.registerCalls.push(appName);
    if (this.registerError) {
      return Promise.reject(this.registerError);
    }

    return Promise.resolve(this.assertion);
  }

  assertPasskeyPrf(allowCredentialId?: string): Promise<PasskeyAssertion> {
    this.assertCalls.push(allowCredentialId);
    if (this.assertError) {
      return Promise.reject(this.assertError);
    }

    return Promise.resolve(this.assertion);
  }
}

describe("usePasskeyWallet support probe", () => {
  it("reports supported when the ceremony probe resolves true", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    await waitFor(() => assert.equal(result.current.supported, true));
  });

  it("reports unsupported when the probe resolves false", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    ceremony.supported = false;
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    // Wait until the probe has actually run before asserting: `supported`
    // starts false, so without proving the effect fired this would pass even
    // if the probe never ran or wrote the wrong value.
    await waitFor(() => assert.equal(ceremony.supportsCallCount, 1));
    await act(async () => {
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, false);
  });

  it("degrades to unsupported when the probe rejects", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    ceremony.supported = new Error("probe boom");
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    await waitFor(() => assert.equal(ceremony.supportsCallCount, 1));
    await act(async () => {
      await flushMicrotasks();
    });
    assert.equal(result.current.supported, false);
  });
});

describe("usePasskeyWallet ceremonies", () => {
  it("createPasskeyWallet registers, opens the wallet, and returns the outcome", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    let outcome: Awaited<ReturnType<typeof result.current.createPasskeyWallet>>;
    await act(async () => {
      outcome = await result.current.createPasskeyWallet("MyApp");
    });

    assert.deepEqual(ceremony.registerCalls, ["MyApp"]);
    assert.equal(client.countOf("openWalletFromPasskey"), 1);
    assert.equal(outcome!.credentialId, "cred-1");
    assert.equal(outcome!.result.identityPubKey, "pk-passkey");
    assert.equal(result.current.busy, false);
    assert.equal(result.current.error, "");
  });

  it("openPasskeyWallet forwards the scoping credential id", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    await act(async () => {
      await result.current.openPasskeyWallet("cred-1");
    });

    assert.deepEqual(ceremony.assertCalls, ["cred-1"]);
    assert.equal(client.countOf("openWalletFromPasskey"), 1);
  });

  it("captures the error and returns null when a ceremony fails", async () => {
    const client = new FakeWalletDKClient();
    const ceremony = new FakeCeremony();
    ceremony.registerError = new Error("user cancelled");
    const { result } = renderWithProvider(client, () =>
      usePasskeyWallet(ceremony),
    );

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.createPasskeyWallet("MyApp");
    });

    assert.equal(outcome, null);
    assert.equal(result.current.error, "user cancelled");
    // The wallet was never opened because the ceremony failed first.
    assert.equal(client.countOf("openWalletFromPasskey"), 0);

    act(() => result.current.clearError());
    assert.equal(result.current.error, "");
  });
});
