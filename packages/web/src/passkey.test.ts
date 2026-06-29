import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { assertPasskeyPrf, registerPasskeyWallet } from "./passkey.ts";

// The browser globals these tests stub out are not present under Node, so we
// snapshot and restore whatever was there to keep the cases isolated.
const savedCrypto = globalThis.crypto;
const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
const savedWindow = (globalThis as { window?: unknown }).window;

function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

describe("assertPasskeyPrf", () => {
  beforeEach(() => {
    stubGlobal("crypto", {
      subtle: { digest: async () => new Uint8Array(32).buffer },
    });
  });

  afterEach(() => {
    stubGlobal("crypto", savedCrypto);
    stubGlobal("navigator", savedNavigator);
  });

  it("requests a discoverable credential and returns hex PRF and credential id", async () => {
    const get = mock.fn(async () => ({
      id: "cred-abc",
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([0xab, 0xcd]).buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { get } });

    const result = await assertPasskeyPrf();

    assert.equal(result.prfOutput, "abcd");
    assert.equal(result.credentialId, "cred-abc");

    const opts = (get.mock.calls[0].arguments[0] as {
      publicKey: { allowCredentials: unknown[]; userVerification: string };
    }).publicKey;
    assert.deepEqual(opts.allowCredentials, []);
    assert.equal(opts.userVerification, "required");
  });

  it("scopes assertion to the given credential id without a chooser", async () => {
    const get = mock.fn(async () => ({
      id: "cred-xyz",
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([0xab, 0xcd]).buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { get } });

    await assertPasskeyPrf("cred-xyz");

    const opts = (get.mock.calls[0].arguments[0] as {
      publicKey: {
        allowCredentials: { type: string; id: ArrayBuffer }[];
        userVerification: string;
      };
    }).publicKey;
    assert.equal(opts.allowCredentials.length, 1);
    assert.equal(opts.allowCredentials[0].type, "public-key");
  });

  it("throws when getClientExtensionResults returns no prf key", async () => {
    const get = mock.fn(async () => ({
      id: "cred-noprf",
      // Authenticator succeeded but returned no PRF extension results.
      getClientExtensionResults: () => ({}),
    }));
    stubGlobal("navigator", { credentials: { get } });

    await assert.rejects(
      () => assertPasskeyPrf(),
      /passkey PRF extension result was not returned by this authenticator/,
    );
  });

  it("throws when navigator.credentials.get resolves to null (cancellation)", async () => {
    const get = mock.fn(async () => null);
    stubGlobal("navigator", { credentials: { get } });

    await assert.rejects(
      () => assertPasskeyPrf(),
      /passkey authentication was cancelled/,
    );
  });
});

describe("registerPasskeyWallet", () => {
  beforeEach(() => {
    stubGlobal("crypto", {
      subtle: { digest: async () => new Uint8Array(32).buffer },
      getRandomValues: (arr: Uint8Array) => arr,
    });
    stubGlobal("window", { location: { hostname: "wallet.example" } });
  });

  afterEach(() => {
    stubGlobal("crypto", savedCrypto);
    stubGlobal("navigator", savedNavigator);
    stubGlobal("window", savedWindow);
  });

  it("returns the PRF from create() without an assertion when surfaced", async () => {
    const create = mock.fn(async () => ({
      id: "cred-new",
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([0x01, 0x02]).buffer } },
      }),
    }));
    const get = mock.fn(async () => {
      throw new Error("assertion should not run when create() surfaces PRF");
    });
    stubGlobal("navigator", { credentials: { create, get } });

    const result = await registerPasskeyWallet("My App");

    assert.equal(result.prfOutput, "0102");
    assert.equal(result.credentialId, "cred-new");
    assert.equal(get.mock.callCount(), 0);
  });

  it("throws when navigator.credentials.create resolves to null (cancellation)", async () => {
    const create = mock.fn(async () => null);
    stubGlobal("navigator", { credentials: { create } });

    await assert.rejects(
      () => registerPasskeyWallet("My App"),
      /passkey registration was cancelled/,
    );
  });

  it("falls back to a scoped assertion when create() omits PRF", async () => {
    const create = mock.fn(async () => ({
      id: "abcd",
      // The authenticator created the credential but returned no PRF here.
      getClientExtensionResults: () => ({}),
    }));
    const get = mock.fn(async () => ({
      id: "abcd",
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([0xbe, 0xef]).buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { create, get } });

    const result = await registerPasskeyWallet("My App");

    assert.equal(result.prfOutput, "beef");
    assert.equal(result.credentialId, "abcd");

    // The fallback assertion is scoped to the just-created credential id.
    assert.equal(get.mock.callCount(), 1);
    const opts = (get.mock.calls[0].arguments[0] as {
      publicKey: { allowCredentials: { type: string; id: ArrayBuffer }[] };
    }).publicKey;
    assert.equal(opts.allowCredentials.length, 1);
    assert.equal(opts.allowCredentials[0].type, "public-key");
  });
});
