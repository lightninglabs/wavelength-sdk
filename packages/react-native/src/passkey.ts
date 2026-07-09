import {
  PASSKEY_PRF_SALT_HEX,
  PasskeyCancelledError,
} from '@lightninglabs/walletdk-core';
import type {
  PasskeyAssertion,
  PasskeyCeremony,
} from '@lightninglabs/walletdk-core';

// Whether a native ceremony rejection means the user dismissed the OS prompt.
// iOS surfaces ASAuthorizationError code 1001 ("canceled"); Android surfaces
// GetCredentialCancellationException / CreateCredentialCancellationException
// with "cancel" in the type or message. Message matching is the only signal
// that crosses the bridge uniformly, since the bridge flattens native
// exceptions to a plain Error with no structured code. Known exception type
// names are matched first, since they are unambiguous; the narrowed
// "user cancel" regex is a fallback for messages that carry the platform
// wording without the type name. A bare /cancel/i is deliberately avoided so
// an unrelated failure whose message merely contains "cancel" (e.g.
// "cancellation token invalid") is not misclassified as a user cancellation.
// Follow-up: a native-side sentinel (an error code field rather than message
// text) would make this exact instead of best-effort.
function isNativeCancel(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';

  if (
    /GetCredentialCancellationException/.test(message) ||
    /CreateCredentialCancellationException/.test(message)
  ) {
    return true;
  }
  if (/ASAuthorizationError/.test(message) && /\b1001\b/.test(message)) {
    return true;
  }
  if (/\berror\s*1001\b/i.test(message)) {
    return true;
  }

  return /\buser.{0,10}cancel/i.test(message);
}

// A passkey ceremony that neither resolves nor rejects within this bound has
// wedged (a silent native provider); reject so useWalletPasskey's
// createPending/openPending flags cannot stick until an app restart.
// Generous enough that a real user completing biometrics or a PIN never
// trips it.
const PASSKEY_TIMEOUT_MS = 120000;

// withPasskeyTimeout rejects if the native ceremony call has not settled
// within PASSKEY_TIMEOUT_MS. It does not cancel the native ceremony; it only
// unwedges the JavaScript promise.
function withPasskeyTimeout<T>(op: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`passkey ${label} timed out`)),
      PASSKEY_TIMEOUT_MS,
    );
    op.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * The subset of the native Turbo Module the passkey ceremony depends on.
 * Narrowed to an interface (rather than the generated Spec) so unit tests can
 * inject a fake without loading react-native.
 */
export type WalletdkPasskeyNativeModule = {
  /** Reports whether the platform can run a passkey PRF ceremony. */
  passkeySupported(): Promise<boolean>;
  /** Runs a passkey registration ceremony; WebAuthn JSON in and out. */
  passkeyCreate(requestJson: string): Promise<string>;
  /** Runs a passkey assertion ceremony; WebAuthn JSON in and out. */
  passkeyGet(requestJson: string): Promise<string>;
};

/** Options for creating the native passkey ceremony. */
export type NativePasskeyCeremonyOptions = {
  /**
   * The WebAuthn relying-party id: the domain whose
   * /.well-known/assetlinks.json (Android) and apple-app-site-association
   * (iOS) vouch for this app. Native apps have no window.location, so the
   * rpId is explicit configuration.
   */
  rpId: string;
};

/**
 * Builds a {@link PasskeyCeremony} over the given native ceremony methods.
 * The factory in index.ts wires the real Turbo Module; unit tests inject a
 * fake. Request and response payloads are standard WebAuthn JSON with
 * base64url binary fields, the format both platform APIs speak natively.
 */
export function nativePasskeyCeremony(
  native: WalletdkPasskeyNativeModule,
  options: NativePasskeyCeremonyOptions,
): PasskeyCeremony {
  const saltB64url = hexToBase64Url(PASSKEY_PRF_SALT_HEX);

  // The memoized probe promise for this ceremony instance. The probe reads
  // native.passkeySupported(), which does not depend on options (rpId etc.),
  // but a fresh native module can be wired into a different ceremony
  // instance, so the memo lives per instance rather than at module scope.
  let supportsPasskeyPrfProbe: Promise<boolean> | null = null;

  const assertPasskeyPrf = async (
    allowCredentialId?: string,
  ): Promise<PasskeyAssertion> => {
    const request = {
      challenge: saltB64url,
      rpId: options.rpId,
      allowCredentials: allowCredentialId
        ? [{ type: 'public-key', id: allowCredentialId }]
        : [],
      userVerification: 'required',
      extensions: { prf: { eval: { first: saltB64url } } },
    };
    let responseJson: string;
    try {
      responseJson = await withPasskeyTimeout(
        native.passkeyGet(JSON.stringify(request)),
        'authentication',
      );
    } catch (err) {
      throw isNativeCancel(err) ? new PasskeyCancelledError() : err;
    }
    const response = JSON.parse(responseJson) as WebAuthnResponse;

    return { prfOutput: requirePrfHex(response), credentialId: response.id };
  };

  return {
    // Memoized per ceremony instance: the first call stores the in-flight
    // probe and every later call reuses it. A rejection is not cached: the
    // memo is cleared first so a later call retries the probe, and this
    // call still degrades to false rather than leaving an unhandled
    // rejection.
    async supportsPasskeyPrf() {
      if (!supportsPasskeyPrfProbe) {
        supportsPasskeyPrfProbe = native.passkeySupported();
      }

      try {
        return await supportsPasskeyPrfProbe;
      } catch {
        supportsPasskeyPrfProbe = null;

        return false;
      }
    },

    async registerPasskeyWallet(appName: string): Promise<PasskeyAssertion> {
      const request = {
        challenge: saltB64url,
        rp: { id: options.rpId, name: appName },
        user: {
          id: randomUserIdBase64Url(),
          name: appName,
          displayName: appName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        extensions: { prf: { eval: { first: saltB64url } } },
      };
      let responseJson: string;
      try {
        responseJson = await withPasskeyTimeout(
          native.passkeyCreate(JSON.stringify(request)),
          'registration',
        );
      } catch (err) {
        throw isNativeCancel(err) ? new PasskeyCancelledError() : err;
      }
      const response = JSON.parse(responseJson) as WebAuthnResponse;

      const first = prfFirst(response);
      if (first) {
        return {
          prfOutput: prfOutputHex(first),
          credentialId: response.id,
        };
      }

      // Some providers do not surface PRF from create; read it with an
      // assertion scoped to the just-created credential, mirroring the web
      // ceremony's fallback.
      return assertPasskeyPrf(response.id);
    },

    assertPasskeyPrf,
  };
}

// The slice of a WebAuthn JSON response the ceremony reads.
type WebAuthnResponse = {
  id: string;
  clientExtensionResults?: { prf?: { results?: { first?: string } } };
};

// prfFirst plucks the base64url PRF output from a response, or null.
function prfFirst(response: WebAuthnResponse): string | null {
  return response?.clientExtensionResults?.prf?.results?.first ?? null;
}

// requirePrfHex reads the mandatory PRF output as hex, matching the web
// ceremony's error when the authenticator did not return one.
function requirePrfHex(response: WebAuthnResponse): string {
  const first = prfFirst(response);
  if (!first) {
    throw new Error(
      'passkey PRF extension result was not returned by this authenticator',
    );
  }

  return prfOutputHex(first);
}

// prfOutputHex decodes a PRF output and requires the WebAuthn-mandated 32
// bytes: short or padded key material must never reach wallet derivation.
function prfOutputHex(firstB64url: string): string {
  const hex = base64UrlToHex(firstB64url);
  if (hex.length !== 64) {
    throw new Error('passkey PRF output is not 32 bytes');
  }

  return hex;
}

// randomUserIdBase64Url makes a fresh 16-byte WebAuthn user handle. user.id
// is an account identifier, not key material, so cryptographic randomness is
// not required; crypto.getRandomValues is still preferred when the runtime
// provides it.
function randomUserIdBase64Url(): string {
  const bytes = new Uint8Array(16);
  // Typed structurally (not as the DOM lib's Crypto) because this package's
  // tsconfig targets ES2022 without DOM, matching its Hermes/RN runtime.
  const cryptoApi = (
    globalThis as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return bytesToBase64Url(bytes);
}

// The base64url alphabet, indexed by 6-bit value.
const B64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// hexToBase64Url re-encodes a lower-case hex string as unpadded base64url.
// Hand-rolled because Hermes offers neither Buffer nor a guaranteed atob.
function hexToBase64Url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytesToBase64Url(bytes);
}

// base64UrlToHex decodes unpadded base64url and renders lower-case hex.
function base64UrlToHex(value: string): string {
  return Array.from(base64UrlToBytes(value))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64URL[a >> 2];
    out += B64URL[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) {
      out += B64URL[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    }
    if (c !== undefined) {
      out += B64URL[c & 0x3f];
    }
  }

  return out;
}

function base64UrlToBytes(value: string): Uint8Array {
  // Tolerate standard base64 alphabet and padding so provider quirks cannot
  // bite, but fail closed on anything else: this decodes wallet key
  // material, and silently skipping a corrupted character would derive a
  // different wallet instead of surfacing an error.
  const normalized = value.replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of normalized) {
    const idx = B64URL.indexOf(ch);
    if (idx < 0) {
      if (ch === '=' || /\s/.test(ch)) {
        continue;
      }
      throw new Error('malformed base64url payload in passkey response');
    }
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(out);
}
