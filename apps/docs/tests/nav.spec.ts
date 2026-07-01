// apps/docs/tests/nav.spec.js (run with: pnpm exec playwright test nav, or node --test)
import { test, expect } from '@playwright/test';
import { flattenNav, accentForSlug, prevNext, NAV, TOP_NAV, isTopNavActive } from '../src/config/nav.ts';
test('nav flattens, accents and prev/next resolve', () => {
  const flat = flattenNav();
  expect(flat.length).toBeGreaterThan(20);
  expect(accentForSlug('concepts/balances-and-vtxos')).toBe('teal');
  expect(accentForSlug('web/guides/send-a-payment')).toBe('lime');
  expect(accentForSlug('web/reference/walletdk-web')).toBe('orange');
  const pn = prevNext('web/guides/send-a-payment');
  expect(pn.section).toBe('guides');
  expect(pn.total).toBeGreaterThan(1);
});

test('nav order is journey-first: get started before reference', () => {
  const labels = NAV.map((g) => g.label);
  const getStartedIdx = labels.indexOf('Get started');
  const referenceIdx = labels.indexOf('Reference');
  const glossaryIdx = labels.indexOf('Glossary');
  expect(getStartedIdx).toBeGreaterThan(-1);
  expect(referenceIdx).toBeGreaterThan(getStartedIdx);
  expect(glossaryIdx).toBeGreaterThan(referenceIdx);
});

test('reference group includes all three packages', () => {
  const ref = NAV.find((g) => g.section === 'reference');
  expect(ref?.items.map((i) => i.slug)).toEqual([
    'reference/walletdk-core',
    'web/reference/walletdk-web',
    'web/reference/walletdk-react',
  ]);
});

test('top nav highlights guides and reference prefixes', () => {
  expect(isTopNavActive('/web/guides/send-a-payment/', TOP_NAV[1])).toBe(true);
  expect(isTopNavActive('/web/reference/walletdk-web/', TOP_NAV[2])).toBe(true);
  expect(isTopNavActive('/reference/walletdk-core/', TOP_NAV[2])).toBe(true);
  expect(isTopNavActive('/web/get-started/quickstart/', TOP_NAV[0])).toBe(true);
});
