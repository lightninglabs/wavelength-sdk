import { test, expect } from '@playwright/test';

test('mobile drawer opens, lists nav, and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/concepts/balances-and-vtxos/');

  const toggle = page.getByRole('button', { name: /open navigation menu/i });
  const drawer = page.locator('#wdk-mobile-drawer');

  await expect(toggle).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');

  await toggle.click();
  await expect(drawer).toHaveAttribute('aria-hidden', 'false');
  // Drawer mirrors the doc nav.
  await expect(drawer.getByRole('link', { name: 'Balances and VTXOs' })).toBeVisible();

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveAttribute('aria-hidden', 'true');
});

test('hamburger is hidden on desktop', async ({ page }) => {
  // Default 1280px viewport - the fixed sidebar covers navigation.
  await page.goto('/concepts/balances-and-vtxos/');
  await expect(page.getByRole('button', { name: /open navigation menu/i })).toBeHidden();
});

test('drawer still works after a client-side navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/concepts/balances-and-vtxos/');

  const toggle = page.getByRole('button', { name: /open navigation menu/i });
  const drawer = page.locator('#wdk-mobile-drawer');

  // Open the drawer and navigate via one of its links (client-side).
  await toggle.click();
  await drawer.getByRole('link', { name: 'Networks and config' }).click();
  await expect(page).toHaveURL(/\/concepts\/networks-and-config\/$/);

  // Reopen on the new page - only works if listeners rebound on astro:page-load.
  await expect(async () => {
    await toggle.click();
    await expect(drawer).toHaveAttribute('aria-hidden', 'false', { timeout: 1000 });
  }).toPass({ timeout: 5000 });
});
