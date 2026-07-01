import { test, expect } from '@playwright/test';
test('header chrome present and sticky', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  await expect(page.locator('header.wdk-header')).toBeVisible();
  await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  const pos = await page.locator('header.wdk-header').evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe('sticky');
});
