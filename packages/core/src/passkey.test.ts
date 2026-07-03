import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSKEY_PRF_NAMESPACE, PASSKEY_PRF_SALT_HEX } from './passkey.ts';

describe('passkey PRF salt', () => {
  it('is the SHA-256 of the namespace', async () => {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(PASSKEY_PRF_NAMESPACE),
    );
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    assert.equal(hex, PASSKEY_PRF_SALT_HEX);
  });
});
