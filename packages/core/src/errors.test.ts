import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PasskeyCancelledError, isPasskeyCancelled, toError } from './errors.ts';

describe('toError', () => {
  it('passes an Error instance through unchanged', () => {
    const err = new Error('boom');
    assert.equal(toError(err), err);
  });

  it('wraps a string into an Error with that message', () => {
    const err = toError('plain failure');
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'plain failure');
  });

  it('wraps unknown values via errorMessage', () => {
    const err = toError({ message: 'obj failure' });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'obj failure');
  });
});

describe('PasskeyCancelledError', () => {
  it('is an Error with a stable name and default message', () => {
    const err = new PasskeyCancelledError();
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'PasskeyCancelledError');
    assert.equal(err.message, 'passkey ceremony was cancelled');
  });
});

describe('isPasskeyCancelled', () => {
  it('recognizes a real PasskeyCancelledError instance', () => {
    assert.equal(isPasskeyCancelled(new PasskeyCancelledError()), true);
  });

  it('recognizes a cross-realm duplicate by name', () => {
    const crossRealm = Object.assign(new Error('cancelled'), {
      name: 'PasskeyCancelledError',
    });
    assert.equal(isPasskeyCancelled(crossRealm), true);
  });

  it('rejects an unrelated Error', () => {
    assert.equal(isPasskeyCancelled(new Error('boom')), false);
  });
});
