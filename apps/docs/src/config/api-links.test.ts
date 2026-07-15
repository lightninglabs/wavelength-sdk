import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiLink } from './api-links.ts';

test('resolves a core symbol to its reference anchor', () => {
  assert.deepEqual(resolveApiLink('WalletEngine'), {
    href: '/reference/wavelength-core/#WalletEngine',
    symbol: 'WalletEngine',
  });
});

test('resolves a transport symbol to its package reference page', () => {
  assert.deepEqual(resolveApiLink('createNativeWalletEngine'), {
    href: '/reference/wavelength-react-native/#createNativeWalletEngine',
    symbol: 'createNativeWalletEngine',
  });
});

test('resolves documented inline types to their exact definition anchors', () => {
  assert.deepEqual(resolveApiLink('DepositResult'), {
    href: '/reference/wavelength-core/#DepositResult',
    symbol: 'DepositResult',
  });
  assert.deepEqual(resolveApiLink('WebWalletEngineOptions'), {
    href: '/reference/wavelength-web/#WebWalletEngineOptions',
    symbol: 'WebWalletEngineOptions',
  });
});

test('does not link primitives or compound type expressions', () => {
  assert.equal(resolveApiLink('string'), undefined);
  assert.equal(resolveApiLink('Promise<WalletEngine>'), undefined);
  assert.equal(resolveApiLink('WalletInfo | null'), undefined);
});

test('does not link symbols outside the documented registry', () => {
  assert.equal(resolveApiLink('NotAnApiSymbol'), undefined);
  assert.equal(resolveApiLink('defaultConfig'), undefined);
});
