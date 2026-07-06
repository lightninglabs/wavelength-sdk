import { test, expect } from '@playwright/test';

// The integrations/react page is the first PlatformTabs consumer.
const PAGE = '/integrations/react/';

test('platform tabs render, switch, and sync across instances', async ({ page }) => {
  await page.goto(PAGE);
  const roots = page.locator('.wdk-platform-tabs');
  await expect(roots.first()).toBeVisible();

  // Web is the default selection; the React Native panel is hidden.
  const first = roots.first();
  await expect(first.locator('[data-label="Web"]')).toBeVisible();
  await expect(first.locator('[data-label="React Native"]')).toBeHidden();

  // Clicking React Native switches every instance on the page.
  await first.getByRole('tab', { name: 'React Native' }).click();
  for (const root of await roots.all()) {
    await expect(root.locator('[data-label="React Native"]')).toBeVisible();
    await expect(root.locator('[data-label="Web"]')).toBeHidden();
  }
});

test('platform selection persists across a reload', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('.wdk-platform-tabs').first().getByRole('tab', { name: 'React Native' }).click();
  await page.reload();
  const first = page.locator('.wdk-platform-tabs').first();
  await expect(first.locator('[data-label="React Native"]')).toBeVisible();
  await expect(first.locator('[data-label="Web"]')).toBeHidden();
});

test('guide platform tabs follow the stored selection', async ({ page }) => {
  await page.goto('/integrations/react/');
  await page.locator('.wdk-platform-tabs').first().getByRole('tab', { name: 'React Native' }).click();
  await page.goto('/guides/create-a-wallet/');
  const first = page.locator('.wdk-platform-tabs').first();
  await expect(first.locator('[data-label="React Native"]')).toBeVisible();
});
