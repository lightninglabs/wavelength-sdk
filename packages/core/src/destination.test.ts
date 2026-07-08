import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDestination } from './destination.ts';

describe('classifyDestination', () => {
  it('reports empty for blank input', () => {
    for (const value of ['', '   ', '\n']) {
      assert.deepEqual(classifyDestination(value), { kind: 'empty' });
    }
  });

  it('reads the amount from the invoice HRP', () => {
    assert.deepEqual(classifyDestination('lnbc2500u1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 250_000 },
    });
    assert.deepEqual(classifyDestination('lnbc20m1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 2_000_000 },
    });
    assert.deepEqual(classifyDestination('lnbc500u1p3xnhl2'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 50_000 },
    });
    assert.deepEqual(classifyDestination('lntbs100n1pvjl'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 10 },
    });
    assert.deepEqual(classifyDestination('lnbc1000n1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 100 },
    });
  });

  it('distinguishes an amountless invoice from a whole-BTC amount', () => {
    assert.deepEqual(classifyDestination('lnbc1pvjluezpp5'), {
      kind: 'invoice',
      amount: { status: 'amountless' },
    });
    assert.deepEqual(classifyDestination('lnbc11pvjluezpp5'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 100_000_000 },
    });
    assert.deepEqual(classifyDestination('lnbc1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'amountless' },
    });
  });

  it('matches every network prefix, longest first', () => {
    assert.deepEqual(classifyDestination('lnbcrt500u1pvjl'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 50_000 },
    });
    assert.deepEqual(classifyDestination('lnbcrt1pvjl'), {
      kind: 'invoice',
      amount: { status: 'amountless' },
    });
    assert.deepEqual(classifyDestination('lntb20m1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 2_000_000 },
    });
  });

  it('treats anything that is not an invoice as an address', () => {
    for (const value of [
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7k3j9v7',
      'bcrt1qw508d6',
      'tark1qqp6f9r',
      'garbage',
    ]) {
      assert.deepEqual(classifyDestination(value), { kind: 'address' });
    }
  });

  it('converts nano and pico amounts exactly, without float rounding', () => {
    // These are the cases a naive `digits * 1e-9 * 1e8` gets wrong: the product
    // lands just off an integer (100.00000000000001) and the amount is lost.
    assert.deepEqual(classifyDestination('lnbc1000n1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 100 },
    });
    assert.deepEqual(classifyDestination('lnbc30n1pvjluez'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 3 },
    });
    assert.deepEqual(classifyDestination('lnbc30000p1pvjl'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 3 },
    });
  });

  it('marks a sub-satoshi or unsafe amount unrepresentable, not amountless', () => {
    // The invoice still carries an amount: the daemon rounds a sub-satoshi
    // figure up to the next satoshi and pays it. A UI must not ask for an
    // amount, but it cannot display one either.
    assert.deepEqual(classifyDestination('lnbc1p1pvjl'), {
      kind: 'invoice',
      amount: { status: 'unrepresentable' },
    });
    assert.deepEqual(classifyDestination('lnbc9n1pvjl'), {
      kind: 'invoice',
      amount: { status: 'unrepresentable' },
    });
    assert.deepEqual(classifyDestination('lnbc99999999999999999999m1pvjl'), {
      kind: 'invoice',
      amount: { status: 'unrepresentable' },
    });
  });

  it('is case insensitive', () => {
    assert.deepEqual(classifyDestination('LNBC2500U1PVJLUEZ'), {
      kind: 'invoice',
      amount: { status: 'known', sat: 250_000 },
    });
  });
});
