import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PasskeyCancelledError } from '@lightninglabs/wavelength-core';
import {
  nativePasskeyCeremony,
  type WavelengthPasskeyNativeModule,
} from './passkey.ts';

// The PRF salt (SHA-256 of the shared namespace) in the two encodings the
// ceremony round-trips between; pinned in core's passkey test.
const SALT_B64URL = 'mnouD_PF0fLxcs1e3WdSe_OSrjmQSOtuNrnLbDq4nQM';

// A 32-byte PRF output fixture (0xabcd repeated), since the ceremony rejects
// anything that is not exactly 32 bytes of key material.
const PRF32_B64URL = 'q82rzavNq82rzavNq82rzavNq82rzavNq82rzavNq80';
const PRF32_HEX = 'abcd'.repeat(16);

// A scriptable fake of the native ceremony methods: records request JSON and
// replays canned responses, mirroring client.test.ts's fake pattern.
function makeFake() {
  const calls: Array<{ method: 'create' | 'get'; request: any }> = [];
  const fake = {
    supported: Promise.resolve(true),
    createResponse: '' as string,
    getResponse: '' as string,
    hang: false,
    native: {
      passkeySupported: () => fake.supported,
      passkeyCreate(requestJson: string) {
        calls.push({ method: 'create', request: JSON.parse(requestJson) });
        return fake.createResponse.startsWith('REJECT')
          ? Promise.reject(new Error(fake.createResponse.slice(7)))
          : Promise.resolve(fake.createResponse);
      },
      passkeyGet(requestJson: string) {
        calls.push({ method: 'get', request: JSON.parse(requestJson) });
        if (fake.hang) {
          return new Promise<string>(() => {});
        }
        return fake.getResponse.startsWith('REJECT')
          ? Promise.reject(new Error(fake.getResponse.slice(7)))
          : Promise.resolve(fake.getResponse);
      },
    } satisfies WavelengthPasskeyNativeModule,
    calls,
  };
  return fake;
}

const withPrf = (id: string, firstB64url: string) =>
  JSON.stringify({
    id,
    rawId: id,
    type: 'public-key',
    clientExtensionResults: { prf: { results: { first: firstB64url } } },
  });

describe('nativePasskeyCeremony', () => {
  it('builds the creation request with the shared salt and rpId', async () => {
    const fake = makeFake();
    fake.createResponse = withPrf('cred-1', PRF32_B64URL);
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await ceremony.registerPasskeyWallet('Demo App');

    const req = fake.calls[0].request;
    assert.equal(fake.calls[0].method, 'create');
    assert.equal(req.challenge, SALT_B64URL);
    assert.equal(req.rp.id, 'rp.example');
    assert.equal(req.rp.name, 'Demo App');
    assert.equal(req.user.name, 'Demo App');
    assert.equal(typeof req.user.id, 'string');
    assert.ok(req.user.id.length > 0);
    assert.equal(req.authenticatorSelection.residentKey, 'required');
    assert.equal(req.authenticatorSelection.userVerification, 'required');
    assert.equal(req.extensions.prf.eval.first, SALT_B64URL);
    assert.deepEqual(
      req.pubKeyCredParams.map((p: { alg: number }) => p.alg),
      [-7, -257],
    );
  });

  it('returns hex PRF output and credential id from registration', async () => {
    const fake = makeFake();
    fake.createResponse = withPrf('cred-1', PRF32_B64URL);
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const result = await ceremony.registerPasskeyWallet('Demo App');

    assert.equal(result.prfOutput, PRF32_HEX);
    assert.equal(result.credentialId, 'cred-1');
  });

  it('falls back to a scoped assertion when create omits PRF', async () => {
    const fake = makeFake();
    fake.createResponse = JSON.stringify({ id: 'cred-2', type: 'public-key' });
    fake.getResponse = withPrf('cred-2', PRF32_B64URL);
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const result = await ceremony.registerPasskeyWallet('Demo App');

    assert.equal(result.prfOutput, PRF32_HEX);
    assert.equal(result.credentialId, 'cred-2');
    const getReq = fake.calls[1];
    assert.equal(getReq.method, 'get');
    assert.deepEqual(getReq.request.allowCredentials, [
      { type: 'public-key', id: 'cred-2' },
    ]);
  });

  it('scopes assertion to the given credential id', async () => {
    const fake = makeFake();
    fake.getResponse = withPrf('cred-3', PRF32_B64URL);
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await ceremony.assertPasskeyPrf('cred-3');

    const req = fake.calls[0].request;
    assert.equal(req.rpId, 'rp.example');
    assert.equal(req.challenge, SALT_B64URL);
    assert.equal(req.userVerification, 'required');
    assert.deepEqual(req.allowCredentials, [
      { type: 'public-key', id: 'cred-3' },
    ]);
    assert.equal(req.extensions.prf.eval.first, SALT_B64URL);
  });

  it('sends empty allowCredentials for a discoverable assertion', async () => {
    const fake = makeFake();
    fake.getResponse = withPrf('cred-4', PRF32_B64URL);
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await ceremony.assertPasskeyPrf();

    assert.deepEqual(fake.calls[0].request.allowCredentials, []);
  });

  it('throws the parity error when the assertion returns no PRF', async () => {
    const fake = makeFake();
    fake.getResponse = JSON.stringify({ id: 'cred-5', type: 'public-key' });
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.assertPasskeyPrf(),
      /passkey PRF extension result was not returned by this authenticator/,
    );
  });

  it('propagates native rejection messages', async () => {
    const fake = makeFake();
    fake.createResponse = 'REJECT:native module unavailable';
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.registerPasskeyWallet('Demo App'),
      /native module unavailable/,
    );
  });

  it('maps a user-cancelled native ceremony to PasskeyCancelledError', async () => {
    const fake = makeFake();
    fake.createResponse =
      'REJECT:androidx.credentials.exceptions.GetCredentialCancellationException: User cancelled';
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.registerPasskeyWallet('Demo App'),
      (err: unknown) => err instanceof PasskeyCancelledError,
    );
  });

  it('does not map an unrelated failure that merely mentions cancel to cancellation', async () => {
    const fake = makeFake();
    fake.createResponse = 'REJECT:cancellation token invalid while registering';
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.registerPasskeyWallet('Demo App'),
      (err: unknown) =>
        err instanceof Error &&
        !(err instanceof PasskeyCancelledError) &&
        /cancellation token invalid while registering/.test(err.message),
    );
  });

  it('does not map a timeout to cancellation', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fake = makeFake();
    fake.hang = true;
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const pending = ceremony.assertPasskeyPrf();
    const rejects = assert.rejects(
      pending,
      (err: unknown) =>
        err instanceof Error && !(err instanceof PasskeyCancelledError),
    );
    t.mock.timers.tick(120000);
    await rejects;
  });

  it('supportsPasskeyPrf degrades to false when the probe rejects', async () => {
    const fake = makeFake();
    fake.supported = Promise.reject(new Error('no module'));
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    assert.equal(await ceremony.supportsPasskeyPrf(), false);
  });

  it('memoizes supportsPasskeyPrf per ceremony instance, and retries after a rejection', async () => {
    const calls: boolean[] = [];
    let behavior: 'reject' | 'resolve' = 'reject';
    const native: WavelengthPasskeyNativeModule = {
      passkeySupported: async () => {
        calls.push(true);
        if (behavior === 'reject') {
          throw new Error('no module');
        }

        return true;
      },
      passkeyCreate: async () => '',
      passkeyGet: async () => '',
    };
    const ceremony = nativePasskeyCeremony(native, { rpId: 'rp.example' });

    // The first call's probe rejects; the ceremony still degrades to false,
    // but does not cache the rejection.
    assert.equal(await ceremony.supportsPasskeyPrf(), false);
    assert.equal(calls.length, 1);

    // A rejected probe is retryable.
    behavior = 'resolve';
    assert.equal(await ceremony.supportsPasskeyPrf(), true);
    assert.equal(calls.length, 2);

    // A resolved probe is memoized for this ceremony instance.
    const [a, b] = await Promise.all([
      ceremony.supportsPasskeyPrf(),
      ceremony.supportsPasskeyPrf(),
    ]);
    assert.equal(a, true);
    assert.equal(b, true);
    assert.equal(calls.length, 2);

    // A different ceremony instance gets its own memo, not the shared one.
    const otherCalls: boolean[] = [];
    const otherNative: WavelengthPasskeyNativeModule = {
      passkeySupported: async () => {
        otherCalls.push(true);

        return true;
      },
      passkeyCreate: async () => '',
      passkeyGet: async () => '',
    };
    const otherCeremony = nativePasskeyCeremony(otherNative, { rpId: 'rp.example' });
    assert.equal(await otherCeremony.supportsPasskeyPrf(), true);
    assert.equal(otherCalls.length, 1);
  });

  it('rejects a PRF output that is not 32 bytes', async () => {
    const fake = makeFake();
    // Two bytes of key material; deriving a wallet from it must never happen.
    fake.getResponse = withPrf('cred-7', 'q80');
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.assertPasskeyPrf(),
      /passkey PRF output is not 32 bytes/,
    );
  });

  it('rejects a corrupted PRF payload instead of decoding around it', async () => {
    const fake = makeFake();
    // The '!' is outside the base64url alphabet; skipping it would silently
    // derive a different wallet, so the codec must fail closed.
    fake.getResponse = withPrf('cred-6', 'q8!0');
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.assertPasskeyPrf(),
      /malformed base64url payload in passkey response/,
    );
  });

  it('rejects when the native ceremony never settles', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const fake = makeFake();
    fake.hang = true;
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const pending = ceremony.assertPasskeyPrf();
    const rejects = assert.rejects(
      pending,
      /passkey authentication timed out/,
    );
    t.mock.timers.tick(120000);
    await rejects;
  });
});
