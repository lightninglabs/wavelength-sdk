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

test('sidebar keeps its scroll position across a client-side navigation', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  const sidebar = page.locator('.wdk-sidebar');

  // Scroll a bottom-of-list link into view so the sidebar is genuinely scrolled
  // (its nav is taller than the viewport), then capture that offset.
  const link = sidebar.getByRole('link', { name: 'Glossary' });
  await link.scrollIntoViewIfNeeded();
  const before = await sidebar.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);

  // Navigate via that link (client-side view transition).
  await link.click();
  await expect(page).toHaveURL(/\/glossary\/$/);

  // The freshly rendered sidebar restores the prior offset instead of snapping
  // back to the top.
  await expect
    .poll(() => page.locator('.wdk-sidebar').evaluate((el) => el.scrollTop), { timeout: 3000 })
    .toBeGreaterThanOrEqual(before - 5);
});

test('doc page carries its section accent', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  const accent = await page.evaluate(() => document.documentElement.getAttribute('data-accent'));
  expect(accent).toBe('teal');
});
