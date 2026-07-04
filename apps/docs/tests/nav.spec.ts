// apps/docs/tests/nav.spec.ts (run with: pnpm exec playwright test nav)
import { test, expect } from '@playwright/test';
import {
  flattenNav, accentForSlug, prevNext, NAV, API_NAV, CLI_NAV,
  SLICES, sliceForPath,
} from '../src/config/nav.ts';

test('nav flattens, accents and prev/next resolve', () => {
  const flat = flattenNav();
  expect(flat.length).toBeGreaterThan(20);
  expect(accentForSlug('concepts/balances-and-vtxos')).toBe('teal');
  expect(accentForSlug('guides/send-a-payment')).toBe('lime');
  expect(accentForSlug('reference/walletdk-web')).toBe('orange');
  const pn = prevNext('guides/send-a-payment');
  expect(pn.section).toBe('guides');
  expect(pn.total).toBeGreaterThan(1);
});

test('nav order is journey-first: get started before reference', () => {
  const labels = NAV.map((g) => g.label);
  const getStartedIdx = labels.indexOf('Get started: Web');
  const referenceIdx = labels.indexOf('Reference');
  const glossaryIdx = labels.indexOf('Glossary');
  expect(getStartedIdx).toBeGreaterThan(-1);
  expect(referenceIdx).toBeGreaterThan(getStartedIdx);
  expect(glossaryIdx).toBeGreaterThan(referenceIdx);
});

test('reference group includes all four packages', () => {
  const ref = NAV.find((g) => g.section === 'reference');
  expect(ref?.items.map((i) => i.slug)).toEqual([
    'reference/walletdk-core',
    'reference/walletdk-react',
    'reference/walletdk-web',
    'reference/walletdk-react-native',
  ]);
});

test('slices resolve by path prefix, SDK is the catch-all', () => {
  expect(SLICES.map((s) => s.label)).toEqual(['SDK', 'API', 'CLI', 'Agents']);
  expect(sliceForPath('/api/wallet/send/').key).toBe('api');
  expect(sliceForPath('/api/').key).toBe('api');
  expect(sliceForPath('/cli/balance/').key).toBe('cli');
  expect(sliceForPath('/agents/').key).toBe('agents');
  expect(sliceForPath('/guides/send-a-payment/').key).toBe('sdk');
  expect(sliceForPath('/').key).toBe('sdk');
});

test('prev/next never crosses a slice boundary', () => {
  const lastSdk = flattenNav(NAV).at(-1)!;
  expect(prevNext(lastSdk.slug).next).toBeUndefined();
  const firstApi = flattenNav(API_NAV)[0];
  expect(prevNext(firstApi.slug).prev).toBeUndefined();
  const lastCli = flattenNav(CLI_NAV).at(-1)!;
  expect(prevNext(lastCli.slug).next).toBeUndefined();
});

test('api nav lists all fifteen wallet method pages', () => {
  const slugs = flattenNav(API_NAV)
    .filter((i) => i.slug.startsWith('api/wallet/'))
    .map((i) => i.slug);
  expect(slugs).toHaveLength(15);
  expect(new Set(slugs).size).toBe(15);
  expect(slugs).toContain('api/wallet/prepare-send');
  expect(slugs).toContain('api/wallet/inspect-activity');
});

test('every nav item has an accent', () => {
  for (const slice of SLICES) {
    for (const item of flattenNav(slice.nav)) {
      expect(accentForSlug(item.slug), item.slug).toBeTruthy();
    }
  }
});

test('header shows slice tabs with the active slice highlighted', async ({ page }) => {
  await page.goto('/api/');
  const tabs = page.locator('.wdk-topnav a');
  await expect(tabs).toHaveText(['SDK', 'API', 'CLI', 'Agents']);
  await expect(page.locator('.wdk-topnav a.wdk-topnav__active')).toHaveText('API');
  await page.goto('/web/get-started/quickstart/');
  await expect(page.locator('.wdk-topnav a.wdk-topnav__active')).toHaveText('SDK');
});
