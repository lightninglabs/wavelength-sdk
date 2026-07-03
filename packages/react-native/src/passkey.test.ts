import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nativePasskeyCeremony,
  type WalletdkPasskeyNativeModule,
} from './passkey.ts';

// The PRF salt (SHA-256 of the shared namespace) in the two encodings the
// ceremony round-trips between; pinned in core's passkey test.
const SALT_B64URL = '8xg7hrwDh8zwVU-yyi1dcEOg_sAslZb_w4UzwI1SBxU';

// A scriptable fake of the native ceremony methods: records request JSON and
// replays canned responses, mirroring client.test.ts's fake pattern.
function makeFake() {
  const calls: Array<{ method: 'create' | 'get'; request: any }> = [];
  const fake = {
    supported: Promise.resolve(true),
    createResponse: '' as string,
    getResponse: '' as string,
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
        return fake.getResponse.startsWith('REJECT')
          ? Promise.reject(new Error(fake.getResponse.slice(7)))
          : Promise.resolve(fake.getResponse);
      },
    } satisfies WalletdkPasskeyNativeModule,
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
    fake.createResponse = withPrf('cred-1', 'q80'); // 0xab 0xcd
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
    fake.createResponse = withPrf('cred-1', 'q80'); // base64url of 0xab 0xcd
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const result = await ceremony.registerPasskeyWallet('Demo App');

    assert.equal(result.prfOutput, 'abcd');
    assert.equal(result.credentialId, 'cred-1');
  });

  it('falls back to a scoped assertion when create omits PRF', async () => {
    const fake = makeFake();
    fake.createResponse = JSON.stringify({ id: 'cred-2', type: 'public-key' });
    fake.getResponse = withPrf('cred-2', 'vu8'); // 0xbe 0xef
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    const result = await ceremony.registerPasskeyWallet('Demo App');

    assert.equal(result.prfOutput, 'beef');
    assert.equal(result.credentialId, 'cred-2');
    const getReq = fake.calls[1];
    assert.equal(getReq.method, 'get');
    assert.deepEqual(getReq.request.allowCredentials, [
      { type: 'public-key', id: 'cred-2' },
    ]);
  });

  it('scopes assertion to the given credential id', async () => {
    const fake = makeFake();
    fake.getResponse = withPrf('cred-3', 'q80');
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
    fake.getResponse = withPrf('cred-4', 'q80');
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
    fake.createResponse = 'REJECT:passkey registration was cancelled';
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    await assert.rejects(
      () => ceremony.registerPasskeyWallet('Demo App'),
      /passkey registration was cancelled/,
    );
  });

  it('supportsPasskeyPrf degrades to false when the probe rejects', async () => {
    const fake = makeFake();
    fake.supported = Promise.reject(new Error('no module'));
    const ceremony = nativePasskeyCeremony(fake.native, { rpId: 'rp.example' });

    assert.equal(await ceremony.supportsPasskeyPrf(), false);
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
});
