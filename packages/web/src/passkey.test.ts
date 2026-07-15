import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  PASSKEY_PRF_SALT_HEX,
  PasskeyCancelledError,
} from "@lightninglabs/wavelength-core";
import {
  assertPasskeyPrf,
  registerPasskeyWallet,
  supportsPasskeyPrf,
} from "./passkey.ts";

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

// A 32-byte PRF output (0xabcd repeated); the ceremony rejects anything that
// is not exactly 32 bytes of key material.
const PRF32_BYTES = new Uint8Array(
  Array.from({ length: 16 }, () => [0xab, 0xcd]).flat(),
);
const PRF32_HEX = "abcd".repeat(16);

describe("assertPasskeyPrf", () => {
  afterEach(() => {
    stubGlobal("navigator", savedNavigator);
  });

  it("sends the shared PRF salt as the challenge and PRF input", async () => {
    const get = mock.fn(async () => ({
      id: "cred-salt",
      getClientExtensionResults: () => ({
        prf: { results: { first: PRF32_BYTES.buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { get } });

    await assertPasskeyPrf();

    // Pins the hex-to-bytes hop: core pins hex == SHA-256(namespace), and a
    // drift here would silently derive a different wallet for existing users.
    const expected = new Uint8Array(Buffer.from(PASSKEY_PRF_SALT_HEX, "hex"));
    const opts = (get.mock.calls[0].arguments[0] as {
      publicKey: {
        challenge: ArrayBuffer;
        extensions: { prf: { eval: { first: ArrayBuffer } } };
      };
    }).publicKey;
    assert.deepEqual(new Uint8Array(opts.challenge), expected);
    assert.deepEqual(new Uint8Array(opts.extensions.prf.eval.first), expected);
  });

  it("requests a discoverable credential and returns hex PRF and credential id", async () => {
    const get = mock.fn(async () => ({
      id: "cred-abc",
      getClientExtensionResults: () => ({
        prf: { results: { first: PRF32_BYTES.buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { get } });

    const result = await assertPasskeyPrf();

    assert.equal(result.prfOutput, PRF32_HEX);
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
        prf: { results: { first: PRF32_BYTES.buffer } },
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

  it("throws when the PRF output is not 32 bytes", async () => {
    const get = mock.fn(async () => ({
      id: "cred-short",
      // Two bytes of key material; deriving a wallet from it must never happen.
      getClientExtensionResults: () => ({
        prf: { results: { first: new Uint8Array([0xab, 0xcd]).buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { get } });

    await assert.rejects(
      () => assertPasskeyPrf(),
      /passkey PRF output is not 32 bytes/,
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

  it("maps a NotAllowedError rejection to PasskeyCancelledError", async () => {
    const get = mock.fn(async () => {
      throw new DOMException("user cancelled", "NotAllowedError");
    });
    stubGlobal("navigator", { credentials: { get } });

    await assert.rejects(
      () => assertPasskeyPrf(),
      (err: unknown) => err instanceof PasskeyCancelledError,
    );
  });

  it("propagates a SecurityError rejection unchanged", async () => {
    const get = mock.fn(async () => {
      throw new DOMException("origin mismatch", "SecurityError");
    });
    stubGlobal("navigator", { credentials: { get } });

    await assert.rejects(
      () => assertPasskeyPrf(),
      (err: unknown) =>
        !(err instanceof PasskeyCancelledError) &&
        err instanceof DOMException &&
        err.name === "SecurityError",
    );
  });
});

describe("registerPasskeyWallet", () => {
  beforeEach(() => {
    stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => arr,
    });
    stubGlobal("window", { location: { hostname: "wallet.example" } });
  });

  afterEach(() => {
    stubGlobal("crypto", savedCrypto);
    stubGlobal("navigator", savedNavigator);
    stubGlobal("window", savedWindow);
  });

  it("sends the shared PRF salt as the challenge and PRF input", async () => {
    const create = mock.fn(async () => ({
      id: "cred-salt",
      getClientExtensionResults: () => ({
        prf: { results: { first: PRF32_BYTES.buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { create } });

    await registerPasskeyWallet("My App");

    // Pins the hex-to-bytes hop: core pins hex == SHA-256(namespace), and a
    // drift here would silently derive a different wallet for existing users.
    const expected = new Uint8Array(Buffer.from(PASSKEY_PRF_SALT_HEX, "hex"));
    const opts = (create.mock.calls[0].arguments[0] as {
      publicKey: {
        challenge: ArrayBuffer;
        extensions: { prf: { eval: { first: ArrayBuffer } } };
      };
    }).publicKey;
    assert.deepEqual(new Uint8Array(opts.challenge), expected);
    assert.deepEqual(new Uint8Array(opts.extensions.prf.eval.first), expected);
  });

  it("returns the PRF from create() without an assertion when surfaced", async () => {
    const create = mock.fn(async () => ({
      id: "cred-new",
      getClientExtensionResults: () => ({
        prf: { results: { first: PRF32_BYTES.buffer } },
      }),
    }));
    const get = mock.fn(async () => {
      throw new Error("assertion should not run when create() surfaces PRF");
    });
    stubGlobal("navigator", { credentials: { create, get } });

    const result = await registerPasskeyWallet("My App");

    assert.equal(result.prfOutput, PRF32_HEX);
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
        prf: { results: { first: PRF32_BYTES.buffer } },
      }),
    }));
    stubGlobal("navigator", { credentials: { create, get } });

    const result = await registerPasskeyWallet("My App");

    assert.equal(result.prfOutput, PRF32_HEX);
    assert.equal(result.credentialId, "abcd");

    // The fallback assertion is scoped to the just-created credential id.
    assert.equal(get.mock.callCount(), 1);
    const opts = (get.mock.calls[0].arguments[0] as {
      publicKey: { allowCredentials: { type: string; id: ArrayBuffer }[] };
    }).publicKey;
    assert.equal(opts.allowCredentials.length, 1);
    assert.equal(opts.allowCredentials[0].type, "public-key");
  });

  it("maps a NotAllowedError rejection to PasskeyCancelledError", async () => {
    const create = mock.fn(async () => {
      throw new DOMException("user cancelled", "NotAllowedError");
    });
    stubGlobal("navigator", { credentials: { create } });

    await assert.rejects(
      () => registerPasskeyWallet("My App"),
      (err: unknown) => err instanceof PasskeyCancelledError,
    );
  });

  it("propagates a plain Error rejection unchanged", async () => {
    const create = mock.fn(async () => {
      throw new Error("registration failed unexpectedly");
    });
    stubGlobal("navigator", { credentials: { create } });

    await assert.rejects(
      () => registerPasskeyWallet("My App"),
      (err: unknown) =>
        !(err instanceof PasskeyCancelledError) &&
        err instanceof Error &&
        err.message === "registration failed unexpectedly",
    );
  });
});

describe("supportsPasskeyPrf", () => {
  const savedPublicKeyCredential = (
    globalThis as { PublicKeyCredential?: unknown }
  ).PublicKeyCredential;

  afterEach(() => {
    stubGlobal("PublicKeyCredential", savedPublicKeyCredential);
    stubGlobal("crypto", savedCrypto);
  });

  it("memoizes the probe, and retries only after a rejection", async () => {
    let calls = 0;
    let behavior: "reject" | "resolve" = "reject";
    stubGlobal("PublicKeyCredential", {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => {
        calls++;
        if (behavior === "reject") {
          throw new Error("probe failed");
        }

        return true;
      },
    });
    stubGlobal("crypto", { subtle: {} });

    // The first call's probe rejects; the function still degrades to false,
    // but does not cache the rejection.
    assert.equal(await supportsPasskeyPrf(), false);
    assert.equal(calls, 1);

    // A rejected probe is retryable: the next call re-probes rather than
    // replaying the stale rejection.
    behavior = "resolve";
    assert.equal(await supportsPasskeyPrf(), true);
    assert.equal(calls, 2);

    // A resolved probe is memoized: a further call reuses it instead of
    // invoking the underlying check again.
    const [a, b] = await Promise.all([
      supportsPasskeyPrf(),
      supportsPasskeyPrf(),
    ]);
    assert.equal(a, true);
    assert.equal(b, true);
    assert.equal(calls, 2);
  });
});
