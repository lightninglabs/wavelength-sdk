// apps/docs/tests/sidebar-toc.spec.js
import { test, expect } from '@playwright/test';

test('sidebar shows groups + active item; TOC lists headings', async ({ page }) => {
  // Use a standard DocLayout page with TOC enabled (quickstart now uses QuickstartLayout,
  // which has a stepper instead of a table of contents).
  await page.goto('/concepts/balances-and-vtxos/');
  // Scope group-label assertion to the sidebar to avoid footer label collision.
  await expect(page.locator('.wdk-sidebar').getByText('Concepts', { exact: true })).toBeVisible();
  await expect(page.locator('.wdk-sidebar a[aria-current="page"]')).toHaveText(/Balances and VTXOs/);
  await expect(page.locator('.wdk-sidebar__divider').first()).toBeVisible();
  await expect(page.locator('.wdk-toc a').first()).toBeVisible();
});

test('doc page carries its section accent', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  const accent = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
  expect(accent).toBe('teal');
});
