import { test, expect } from '@playwright/test';
test('home renders the v4 hero + sections, no Starlight splash', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.wdk-hero')).toBeVisible();
  await expect(page.getByRole('link', { name: /quick start/i }).first()).toBeVisible();
  await expect(page.locator('.wdk-hero__squares > *')).toHaveCount(10); // floating squares motif (5 left + 5 right)
  await expect(page.locator('.starlight-aside')).toHaveCount(0);
});

test('home links to the API and CLI slices', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.wdk-refs a[href="/api/"]')).toBeVisible();
  await expect(page.locator('.wdk-refs a[href="/cli/"]')).toBeVisible();
});
