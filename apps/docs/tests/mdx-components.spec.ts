import { test, expect } from '@playwright/test';

test('content renders our Callout, not Starlight aside', async ({ page }) => {
  // Use a standard DocLayout page with a Callout (quickstart now uses QuickstartLayout).
  await page.goto('/concepts/balances-and-vtxos/');
  // Our callout uses .wdk-callout; Starlight used .starlight-aside.
  await expect(page.locator('.wdk-callout').first()).toBeVisible();
  await expect(page.locator('.starlight-aside')).toHaveCount(0);
});
