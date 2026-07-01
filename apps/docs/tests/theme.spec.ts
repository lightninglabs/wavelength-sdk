import { test, expect } from '@playwright/test';
import { normHex } from './helpers';

test('dark + light palettes apply and toggle flips them', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/concepts/balances-and-vtxos/');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
  expect(normHex(bg)).toBe('#141417');
  // ThemeToggle is a client:load island; a click can land before React attaches
  // its handler. Retry the click until the theme actually flips (toPass exits on
  // the first successful flip, so there is no double-toggle).
  const toggle = page.getByRole('button', { name: /theme/i });
  await expect(toggle).toBeVisible();
  await expect(async () => {
    await toggle.click();
    const flipped = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    expect(normHex(flipped)).not.toBe('#141417'); // flipped to light
  }).toPass({ timeout: 5000 });
});
