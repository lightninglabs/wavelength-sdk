import {
  PASSKEY_PRF_SALT_HEX,
  PasskeyCancelledError,
} from "@lightninglabs/walletdk-core";
import type { PasskeyAssertion } from "@lightninglabs/walletdk-core";

// Whether a WebAuthn rejection means the user dismissed or timed out the OS
// prompt, as opposed to a real failure. NotAllowedError is the spec-mandated
// name for both cancel and timeout; AbortError covers programmatic aborts.
function isWebAuthnCancel(err: unknown): boolean {
  return (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    (err.name === "NotAllowedError" || err.name === "AbortError")
  );
}

// The memoized probe promise, shared across every supportsPasskeyPrf() call
// for the page's lifetime. Null when no probe is in flight or cached.
let supportsPasskeyPrfProbe: Promise<boolean> | null = null;

// rawSupportsPasskeyPrf runs the actual platform authenticator availability
// check, without swallowing a rejection, so the memo above can distinguish
// "resolved false" (cached) from "rejected" (retried on the next call).
async function rawSupportsPasskeyPrf(): Promise<boolean> {
  if (!globalThis.PublicKeyCredential || !globalThis.crypto?.subtle) {
    return false;
  }

  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

/**
 * Reports whether a user-verifying platform authenticator is available,
 * which is a prerequisite for WebAuthn PRF but does not guarantee that the
 * authenticator will return a PRF result; there is no synchronous
 * PRF-detection API, so a browser may return true here yet fail the
 * ceremony.
 *
 * The underlying probe is memoized at module scope: the first call starts
 * it and every later call reuses the same in-flight or resolved promise, so
 * the platform authenticator check runs at most once per page lifetime. A
 * rejection is not cached: this function still degrades to false on a
 * rejection, but clears the memo first so a later call retries the probe
 * from scratch instead of replaying a poisoned promise.
 */
export async function supportsPasskeyPrf(): Promise<boolean> {
  if (!supportsPasskeyPrfProbe) {
    supportsPasskeyPrfProbe = rawSupportsPasskeyPrf();
  }

  try {
    return await supportsPasskeyPrfProbe;
  } catch {
    supportsPasskeyPrfProbe = null;

    return false;
  }
}

// prfSalt decodes the shared PRF evaluation input (SHA-256 of the PRF
// namespace, precomputed in core). The same salt on every device/platform is
// what makes the derived wallet reproducible.
function prfSalt(): ArrayBuffer {
  const bytes = new Uint8Array(PASSKEY_PRF_SALT_HEX.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(PASSKEY_PRF_SALT_HEX.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes.buffer;
}

// prfFirst extracts the first PRF evaluation output from client extension
// results, throwing when the browser did not surface a PRF value.
function prfFirst(results: unknown): ArrayBuffer {
  const ext = results as { prf?: { results?: { first?: ArrayBuffer } } };
  const first = ext?.prf?.results?.first;
  if (!first) {
    throw new Error(
      "passkey PRF extension result was not returned by this authenticator",
    );
  }

  return first;
}

// registerPasskeyWallet creates a new platform passkey and returns its PRF
// output (hex) and credential id. Some browsers do not surface PRF from
// create(), so we fall back to an assertion scoped to the just-created
// credential to read it reliably without prompting a chooser.
export async function registerPasskeyWallet(
  appName: string,
): Promise<PasskeyAssertion> {
  const salt = prfSalt();
  const userId = crypto.getRandomValues(new Uint8Array(16));

  let created: PublicKeyCredential | null;
  try {
    created = (await navigator.credentials.create({
      publicKey: {
        challenge: salt,
        rp: { name: appName, id: window.location.hostname },
        user: { id: userId, name: appName, displayName: appName },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
        },
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw isWebAuthnCancel(err)
      ? new PasskeyCancelledError("passkey registration was cancelled")
      : err;
  }
  if (!created) {
    throw new PasskeyCancelledError("passkey registration was cancelled");
  }

  const createResults = created.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  if (createResults?.prf?.results?.first) {
    return {
      prfOutput: prfOutputHex(createResults.prf.results.first),
      credentialId: created.id,
    };
  }

  return assertPasskeyPrf(created.id);
}

// assertPasskeyPrf authenticates with a passkey and returns its PRF output (hex)
// plus the credential id used. With allowCredentialId set, the assertion is
// scoped to that one credential so the OS unlocks it directly without a
// chooser; without it, the assertion is discoverable (empty allowCredentials)
// so a synced passkey can be offered on a device that has never seen this
// wallet.
export async function assertPasskeyPrf(
  allowCredentialId?: string,
): Promise<PasskeyAssertion> {
  const salt = prfSalt();
  const allowCredentials = allowCredentialId
    ? [{ type: "public-key" as const, id: base64UrlToBuffer(allowCredentialId) }]
    : [];

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: salt,
        allowCredentials,
        userVerification: "required",
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (err) {
    throw isWebAuthnCancel(err)
      ? new PasskeyCancelledError("passkey authentication was cancelled")
      : err;
  }
  if (!assertion) {
    throw new PasskeyCancelledError("passkey authentication was cancelled");
  }

  return {
    prfOutput: prfOutputHex(prfFirst(assertion.getClientExtensionResults())),
    credentialId: assertion.id,
  };
}

// base64UrlToBuffer decodes a base64url WebAuthn credential id into bytes.
function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

// bufferToHex renders a binary buffer as a lower-case hex string.
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// prfOutputHex renders the PRF output as hex and requires the WebAuthn-
// mandated 32 bytes: short or padded key material must never reach wallet
// derivation, matching the native ceremony's guard.
function prfOutputHex(buffer: ArrayBuffer): string {
  const hex = bufferToHex(buffer);
  if (hex.length !== 64) {
    throw new Error("passkey PRF output is not 32 bytes");
  }

  return hex;
}
