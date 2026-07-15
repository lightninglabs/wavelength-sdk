/**
 * prev-next.spec.ts - TDD tests for PrevNext and RelatedGuides components.
 * RED: written before the components exist. GREEN: pass once components are mounted.
 */
import { test, expect } from '@playwright/test';

// A mid-nav concept page that should have both prev and next.
const CONCEPTS_BALANCES = '/concepts/balances-and-vtxos/';

// A guide that has related[] set in frontmatter (send-a-payment has 4 related items).
const GUIDE_SEND = '/guides/send-a-payment/';

// A content page (DocLayout mounts RelatedGuides) with no related[] in its
// frontmatter, used to assert RelatedGuides renders nothing when the list is empty.
const NO_RELATED_PAGE = '/concepts/leaving-ark/';

test.describe('PrevNext component', () => {
  test('concept page renders [data-prevnext]', async ({ page }) => {
    await page.goto(CONCEPTS_BALANCES);
    await expect(page.locator('[data-prevnext]')).toBeVisible();
  });

  test('concept page has a working next link', async ({ page }) => {
    await page.goto(CONCEPTS_BALANCES);
    const nextLink = page.locator('[data-prevnext] [data-next-link]');
    await expect(nextLink).toBeVisible();
    const href = await nextLink.getAttribute('href');
    expect(href).toBeTruthy();
    // The linked page must exist (200).
    const res = await page.goto(href!);
    expect(res).not.toBeNull();
    expect(res!.status()).toBe(200);
  });

  test('concept page has a working prev link', async ({ page }) => {
    await page.goto(CONCEPTS_BALANCES);
    const prevLink = page.locator('[data-prevnext] [data-prev-link]');
    await expect(prevLink).toBeVisible();
    const href = await prevLink.getAttribute('href');
    expect(href).toBeTruthy();
    const res = await page.goto(href!);
    expect(res).not.toBeNull();
    expect(res!.status()).toBe(200);
  });

  test('guide page renders [data-prevnext]', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    await expect(page.locator('[data-prevnext]')).toBeVisible();
  });

  test('first nav page has no previous link and has a next link', async ({ page }) => {
    // What is Wavelength is the first page in the nav (Introduction section).
    await page.goto('/introduction/what-is-wavelength-sdk/');
    await expect(page.locator('[data-prev-link]')).toHaveCount(0);
    await expect(page.locator('[data-next-link]')).toBeVisible();
  });

  test('renders a progress row with a "Step N of M" label', async ({ page }) => {
    await page.goto(CONCEPTS_BALANCES);
    const progress = page.locator('[data-prevnext-progress]');
    await expect(progress).toBeVisible();
    const label = await progress.locator('.wdk-prevnext__progress-label').innerText();
    expect(label).toMatch(/^Step \d+ of \d+/);
  });

  test('the progress bar fill has a non-zero width', async ({ page }) => {
    await page.goto(CONCEPTS_BALANCES);
    const fill = page.locator('[data-prevnext-progress] .wdk-prevnext__bar-fill');
    await expect(fill).toBeVisible();
    const width = await fill.evaluate((el) => el.style.width);
    expect(width).toMatch(/^\d+%$/);
    expect(parseInt(width, 10)).toBeGreaterThan(0);
  });

  test('prev/next links do not get prose underline on hover', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    const nextLink = page.locator('[data-next-link]');
    await nextLink.hover();
    const decoration = await nextLink.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(decoration).not.toBe('underline');
  });
});

test.describe('RelatedGuides component', () => {
  test('guide with related renders [data-related]', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    await expect(page.locator('[data-related]')).toBeVisible();
  });

  test('send-a-payment has exactly 4 related cards', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    // send-a-payment.mdx has 4 related slugs.
    const cards = page.locator('[data-related] [data-related-card]');
    await expect(cards).toHaveCount(4);
  });

  test('each related card has an href and visible title', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    const cards = page.locator('[data-related] [data-related-card]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const href = await card.getAttribute('href');
      expect(href).toBeTruthy();
      // Each card must have visible text (the guide title).
      const text = await card.innerText();
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('a page with no related items renders no [data-related]', async ({ page }) => {
    // A content page with no related[] in frontmatter renders no RelatedGuides.
    await page.goto(NO_RELATED_PAGE);
    const related = page.locator('[data-related]');
    await expect(related).toHaveCount(0);
  });

  test('related cards do not get prose underline on hover', async ({ page }) => {
    await page.goto(GUIDE_SEND);
    const card = page.locator('[data-related-card]').first();
    await card.hover();
    const decoration = await card.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    expect(decoration).not.toBe('underline');
  });
});
