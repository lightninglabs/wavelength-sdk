import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const URLS = [
  '/', '/introduction/what-is-wavelength-sdk/', '/concepts/balances-and-vtxos/',
  '/glossary/', '/reference/wavelength-core/',
  '/web/get-started/quickstart/', '/guides/send-a-payment/',
  '/react-native/get-started/quickstart/',
  '/react-native/get-started/installation/',
  '/react-native/get-started/requirements/',
  '/react-native/get-started/passkey-setup/',
  '/react-native/get-started/run-the-demo-app/',
  '/react-native/troubleshooting/',
  '/reference/wavelength-web/', '/web/support/troubleshooting/',
];

test('every existing URL still resolves', async ({ page }) => {
  for (const url of URLS) {
    const res = await page.goto(url);
    expect(res).not.toBeNull();
    expect(res!.status(), url).toBe(200);
  }
});

test('Starlight is gone from the output', async ({ page }) => {
  await page.goto('/');
  const html = await page.content();
  expect(html).not.toContain('starlight');
});

test('the sidebar offers the React Native journey from web pages', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const rnLinks = page.locator('a[href="/react-native/get-started/quickstart/"]');
  expect(await rnLinks.count()).toBeGreaterThan(0);
  const res = await page.goto('/react-native/get-started/quickstart/');
  expect(res?.status()).toBe(200);
});

// --- Playground deferral assertions (Task 8) ---

// The Playground is deferred. No shipped page should link to it.
const PLAYGROUND_CHECK_PAGES = ['/', '/web/get-started/quickstart/', '/guides/send-a-payment/'];

test('no shipped page links to a playground route', async ({ page }) => {
  for (const url of PLAYGROUND_CHECK_PAGES) {
    await page.goto(url);
    const playgroundLinks = await page.locator('a[href*="playground"]').count();
    expect(playgroundLinks, `${url} must have 0 playground links`).toBe(0);
  }
});

test('/web/playground/ is not a route (404)', async ({ page }) => {
  const res = await page.goto('/web/playground/');
  expect(res).not.toBeNull();
  expect(res!.status()).toBe(404);
});

// The COEP/COOP block was removed because the Playground (which needs
// SharedArrayBuffer/OPFS) is deferred. Only commented-out directives are allowed.
test('_headers has no active COEP or COOP directive', () => {
  const headersPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../public/_headers',
  );
  const lines = readFileSync(headersPath, 'utf-8').split('\n');
  const activeLines = lines.filter(
    (line) =>
      !line.trimStart().startsWith('#') &&
      (line.includes('Cross-Origin-Embedder-Policy') ||
        line.includes('Cross-Origin-Opener-Policy')),
  );
  expect(activeLines, 'Active COEP/COOP directives found in _headers').toHaveLength(0);
});
