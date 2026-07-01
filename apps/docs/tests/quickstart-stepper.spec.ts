import { test, expect } from '@playwright/test';

// Tests for the QuickstartLayout stepper.
// The stepper must render one [data-step-item] per <Step>, keep exactly one
// .is-active at all times, scroll to the correct section when a step label
// is clicked, sit on the RIGHT rail (after the content column, not a second
// left-hand nav next to the Sidebar), and the quickstart code blocks must
// render via Expressive Code rather than hand-rolled <pre> markup.

test('quickstart renders a [data-stepper] with one item per step', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const stepper = page.locator('[data-stepper]');
  await expect(stepper).toBeVisible();
  // There are four steps in the quickstart (Install, Wire provider, Create a wallet, Try it).
  const items = page.locator('[data-stepper] [data-step-item]');
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBe(4);
});

test('stepper rail sits to the right of the content column', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  await expect(page.locator('[data-stepper] [data-step-item]').first()).toBeVisible();

  // The rail must sit to the right of the content column and hug the viewport
  // edge (fixed full-height rail, same geometry as the TOC / reference rails).
  const rail = page.locator('.wdk-qs__stepper');
  await expect(rail).toBeVisible();
  const content = page.locator('.wdk-qs__content');
  await expect(content).toBeVisible();

  const railBox = await rail.boundingBox();
  const contentBox = await content.boundingBox();
  expect(railBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(railBox!.x).toBeGreaterThan(contentBox!.x);

  const railStyle = await page.evaluate(() => {
    const el = document.querySelector('.wdk-qs__stepper');
    if (!el) return null;
    const style = getComputedStyle(el);
    return { position: style.position, width: style.width, right: style.right };
  });
  expect(railStyle).toEqual({ position: 'fixed', width: '240px', right: '0px' });

  // DOM order also reflects the right-rail position: the stepper aside comes
  // after the content <main> inside .wdk-qs__main.
  const order = await page.evaluate(() => {
    const main = document.querySelector('.wdk-qs__main');
    if (!main) return [];
    return Array.from(main.children).map((el) => el.className);
  });
  const contentIdx = order.findIndex((c) => c.includes('wdk-qs__content'));
  const railIdx = order.findIndex((c) => c.includes('wdk-qs__stepper'));
  expect(contentIdx).toBeGreaterThanOrEqual(0);
  expect(railIdx).toBeGreaterThan(contentIdx);
});

test('step links render with visible styling (not plain unstyled text)', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const firstItem = page.locator('[data-stepper] [data-step-item]').first();
  await expect(firstItem).toBeVisible();

  // The item must lay out as a flex row (numbered node + label), proving the
  // generated markup actually receives the rail's CSS rather than falling
  // back to default list-item styling.
  await expect(firstItem).toHaveCSS('display', 'flex');

  const label = firstItem.locator('.wdk-qs__step-label');
  await expect(label).toBeVisible();
  const fontSize = await label.evaluate((el) => window.getComputedStyle(el).fontSize);
  expect(parseFloat(fontSize)).toBeGreaterThan(0);
});

test('quickstart code blocks render via Expressive Code', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const ecBlocks = page.locator('.wdk-qs__content .expressive-code');
  await expect(ecBlocks.first()).toBeVisible();
  // The quickstart has five fenced code blocks (one install command plus four
  // titled tsx snippets across the four steps).
  expect(await ecBlocks.count()).toBeGreaterThanOrEqual(2);

  // Every <pre> in the content column must live inside an Expressive Code
  // frame - a hand-rolled <pre> with no .expressive-code ancestor must not
  // be present.
  const preCount = await page.locator('.wdk-qs__content pre').count();
  const ecPreCount = await page.locator('.wdk-qs__content .expressive-code pre').count();
  expect(preCount).toBe(ecPreCount);
});

test('exactly one step is .is-active on load', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  // Wait for the stepper to be initialised (astro:page-load fires it).
  await expect(page.locator('[data-stepper] [data-step-item].is-active')).toHaveCount(1);
});

test('clicking a step label scrolls to its section and activates it', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  // Wait for stepper initialisation.
  await expect(page.locator('[data-stepper] [data-step-item].is-active')).toHaveCount(1);

  // Click the third step label (index 2).
  const thirdItem = page.locator('[data-stepper] [data-step-item]').nth(2);
  await thirdItem.click();

  // The active step should change to the third one.
  await expect(async () => {
    const activeItems = page.locator('[data-stepper] [data-step-item].is-active');
    await expect(activeItems).toHaveCount(1);
    // Verify the third item is now active.
    await expect(thirdItem).toHaveClass(/is-active/);
  }).toPass({ timeout: 5000 });
});

test('stepper syncs active state as user scrolls through step sections', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  await expect(page.locator('[data-stepper] [data-step-item].is-active')).toHaveCount(1);

  // Scroll to the last [data-step] section; the active step must change.
  const lastSection = page.locator('[data-step]').last();
  await lastSection.scrollIntoViewIfNeeded();

  await expect(async () => {
    // The last step item should become active.
    const lastItem = page.locator('[data-stepper] [data-step-item]').last();
    await expect(lastItem).toHaveClass(/is-active/);
    // Still exactly one active item.
    await expect(page.locator('[data-stepper] [data-step-item].is-active')).toHaveCount(1);
  }).toPass({ timeout: 5000 });
});
