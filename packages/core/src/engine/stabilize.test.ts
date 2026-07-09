import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stabilize } from './stabilize.ts';

describe('stabilize', () => {
  it('returns prev when the JSON encoding is identical', () => {
    const prev = { a: 1, list: [1, 2] };
    const next = { a: 1, list: [1, 2] };
    assert.equal(stabilize(prev, next), prev);
  });

  it('returns next when a value changed', () => {
    const prev = { a: 1 };
    const next = { a: 2 };
    assert.equal(stabilize(prev, next), next);
  });

  it('returns next when prev is null', () => {
    const next = { a: 1 };
    assert.equal(stabilize<{ a: number } | null>(null, next), next);
  });

  it('returns null next as-is', () => {
    assert.equal(stabilize<{ a: number } | null>({ a: 1 }, null), null);
  });
});
