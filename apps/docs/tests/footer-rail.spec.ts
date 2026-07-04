import { test, expect } from '@playwright/test';
import { edges } from './helpers';

// The site footer is rendered globally by BaseLayout as a full-width sibling
// after the page content. The left sidebar is fixed full-height, so layouts
// inset the footer on the left to clear it. Page-level right rails (TOC,
// stepper, symbol list) stop at the footer top via RightRailCap.astro, so
// the footer stays full-width on the right.

test('guide footer clears the left sidebar and extends to the right edge', async ({ page }) => {
  await page.goto('/guides/create-a-wallet/');
  const footer = page.locator('.wdk-footer');
  const sidebar = page.locator('.wdk-sidebar');
  const toc = page.locator('.wdk-toc');
  await expect(footer).toBeVisible();
  await expect(sidebar).toBeVisible();
  await expect(toc).toBeVisible();

  const f = await edges(footer);
  const s = await edges(sidebar);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  expect(f.left).toBeGreaterThanOrEqual(s.right - 2);
  expect(f.right).toBeCloseTo(viewport!.width, 0);
});

test('reference footer clears the sidebar and extends to the right edge', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const footer = page.locator('.wdk-footer');
  const sidebar = page.locator('.wdk-sidebar');
  const rail = page.locator('.wdk-ref__rail');
  await expect(footer).toBeVisible();

  const f = await edges(footer);
  const s = await edges(sidebar);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  expect(f.left).toBeGreaterThanOrEqual(s.right - 2);
  expect(f.right).toBeCloseTo(viewport!.width, 0);
  await expect(rail).toBeVisible();
});

test('quickstart footer clears the sidebar and extends to the right edge', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const footer = page.locator('.wdk-footer');
  const sidebar = page.locator('.wdk-sidebar');
  await expect(footer).toBeVisible();

  const f = await edges(footer);
  const s = await edges(sidebar);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  expect(f.left).toBeGreaterThanOrEqual(s.right - 2);
  expect(f.right).toBeCloseTo(viewport!.width, 0);
});

test('home footer is full-width (no rail insets)', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('.wdk-footer');
  await expect(footer).toBeVisible();
  await expect(page.locator('.wdk-sidebar')).toHaveCount(0);

  const f = await edges(footer);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(f.left).toBeCloseTo(0, 0);
  expect(f.right).toBeCloseTo(viewport!.width, 0);
});

test('TOC rail bottom aligns with footer top when scrolled to the page bottom', async ({ page }) => {
  await page.goto('/guides/create-a-wallet/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(async () => {
    const tocBottom = await page.locator('.wdk-toc').evaluate((el) => el.getBoundingClientRect().bottom);
    const footerTop = await page.locator('.wdk-footer').evaluate((el) => el.getBoundingClientRect().top);
    expect(tocBottom).toBeCloseTo(footerTop, 0);
  }).toPass({ timeout: 3000 });
});
