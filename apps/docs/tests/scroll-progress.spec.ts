import { test, expect } from '@playwright/test';

// Long doc page so the body actually overflows and the bar can fill.
const LONG_PAGE = '/concepts/balances-and-vtxos/';

test('scroll-progress bar exists at zero width, then fills on scroll', async ({ page }) => {
  await page.goto(LONG_PAGE);
  const bar = page.locator('[role="progressbar"].wdk-scroll-progress');
  await expect(bar).toBeAttached();

  // At the top of the page the bar should report zero width.
  const widthAtTop = await bar.evaluate((el) => el.getBoundingClientRect().width);
  expect(widthAtTop).toBe(0);

  // Scroll to the bottom of the document and let the scroll handler run.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(async () => {
    const width = await bar.evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
});

test('rail surface is distinct from the content background', async ({ page }) => {
  await page.goto(LONG_PAGE);
  const railBg = await page.locator('.wdk-sidebar').evaluate((el) => getComputedStyle(el).backgroundColor);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(railBg).not.toBe(bodyBg);
});
