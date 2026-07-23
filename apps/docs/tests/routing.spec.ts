import { test, expect } from '@playwright/test';

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
  '/native-ios-android/overview/',
  '/native-ios-android/architecture/',
  '/native-ios-android/quickstart/',
  '/reference/wavelength-web/', '/web/support/troubleshooting/',
];

test('every existing URL still resolves', async ({ page }) => {
  for (const url of URLS) {
    const res = await page.goto(url);
    expect(res).not.toBeNull();
    expect(res!.status(), url).toBe(200);
  }
});

test('the sidebar offers the React Native journey from web pages', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const rnLinks = page.locator('a[href="/react-native/get-started/quickstart/"]');
  expect(await rnLinks.count()).toBeGreaterThan(0);
  const res = await page.goto('/react-native/get-started/quickstart/');
  expect(res?.status()).toBe(200);
});
