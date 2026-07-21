import { test, expect } from '@playwright/test';
test('home renders the v4 hero + sections, no Starlight splash', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.wdk-hero')).toBeVisible();
  await expect(page.getByRole('link', { name: /quick start/i }).first()).toBeVisible();
  await expect(page.locator('.wdk-hero__squares > *')).toHaveCount(10); // floating squares motif (5 left + 5 right)
  await expect(page.locator('.starlight-aside')).toHaveCount(0);
});

test('home surfaces band links every integration surface', async ({ page }) => {
  await page.goto('/');
  const band = page.locator('.wdk-surfaces');
  await expect(band).toBeVisible();
  await expect(band.locator('a[href="/web/get-started/quickstart/"]')).toBeVisible();
  await expect(band.locator('a[href="/react-native/get-started/quickstart/"]')).toBeVisible();
  await expect(band.locator('a[href="/native-ios-android/overview/"]')).toBeVisible();
  await expect(band.locator('a[href="/api/"]')).toBeVisible();
  await expect(band.locator('a[href="/cli/"]')).toBeVisible();
  await expect(band.locator('a[href="/agents/"]')).toBeVisible();
});

test('home imports defaultConfig from the web transport', async ({ page }) => {
  await page.goto('/');
  const sample = page.locator('.wdk-hero__code-body');

  await expect(sample).toContainText(
    /import\s+\{\s*createWebWalletEngine,\s*defaultConfig\s*\}\s+from\s+'@lightninglabs\/wavelength-web'/,
  );
  await expect(sample).not.toContainText('@lightninglabs/wavelength-core');
});
