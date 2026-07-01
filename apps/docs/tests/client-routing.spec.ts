import { test, expect } from '@playwright/test';

test('navigation is client-side (no full document reload)', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  // Marker on the live JS context; a full document reload would wipe it.
  await page.evaluate(() => { window.__wdkNoReload = true; });

  await page.locator('.wdk-sidebar').getByRole('link', { name: 'Activity and events' }).click();

  await expect(page).toHaveURL(/\/concepts\/activity-and-events\/$/);
  await expect(page.locator('h1.wdk-doc__title')).toHaveText('Activity & events');
  expect(await page.evaluate(() => window.__wdkNoReload === true)).toBe(true);
});

test('per-section accent updates across a client-side navigation', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBe('teal');
  await page.evaluate(() => { window.__wdkNoReload = true; });

  await page.locator('.wdk-sidebar').getByRole('link', { name: 'walletdk-core' }).click();

  await expect(page).toHaveURL(/\/reference\/walletdk-core\/$/);
  // Confirm it was a client-side swap, not a reload, and the accent followed.
  expect(await page.evaluate(() => window.__wdkNoReload === true)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.dataset.accent)).toBe('orange');
});

test('theme choice persists across a client-side navigation', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/concepts/balances-and-vtxos/');

  // Toggle to light (client:load island - retry until the handler is attached).
  const toggle = page.getByRole('button', { name: /theme/i });
  await expect(async () => {
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  }).toPass({ timeout: 5000 });

  // A view-transition swap resets <html> attributes; the theme must be re-applied.
  await page.locator('.wdk-sidebar').getByRole('link', { name: 'Activity and events' }).click();
  await expect(page).toHaveURL(/\/concepts\/activity-and-events\/$/);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});
