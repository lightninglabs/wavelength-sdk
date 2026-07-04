import { test, expect } from '@playwright/test';

// Tests for the new GuideArticleLayout (GR3).
// The conventional, inline-code guide page replaces the scroll-synced rail.
// Asserts that /guides/create-a-wallet/ renders:
//   1. A breadcrumb (.wdk-guide__breadcrumb).
//   2. A numbered first step - the first in-content h2 gets a CSS-counter
//      circle via ::before whose content resolves to "1".
//   3. The reused "On this page" rail (.wdk-toc).
//   4. data-accent="lime" on <html>.
//   5. The old scrollytelling [data-code-rail] is ABSENT.

const PAGE = '/guides/create-a-wallet/';

test('guide page renders a breadcrumb', async ({ page }) => {
  await page.goto(PAGE);
  const crumb = page.locator('.wdk-guide__breadcrumb');
  await expect(crumb).toBeVisible();
  // The breadcrumb leads with the WalletDK > Guides trail.
  await expect(crumb).toContainText('WalletDK');
  await expect(crumb).toContainText('Guides');
});

test('the "Guides" breadcrumb crumb is not a link (there is no guides index page)', async ({ page }) => {
  await page.goto(PAGE);
  const crumb = page.locator('.wdk-guide__breadcrumb');
  // "WalletDK" still links home.
  await expect(crumb.locator('a', { hasText: 'WalletDK' })).toHaveAttribute('href', '/');
  // "Guides" is plain text, not an anchor, since no guides index page exists.
  await expect(crumb.locator('a', { hasText: 'Guides' })).toHaveCount(0);
  await expect(crumb.locator('span', { hasText: 'Guides' })).toBeVisible();
});

test('first in-content h2 shows a numbered step circle', async ({ page }) => {
  await page.goto(PAGE);
  const firstH2 = page.locator('.wdk-guide__content h2').first();
  await expect(firstH2).toBeVisible();

  // The numbered step is a ::before circle driven by a CSS counter. Browsers
  // return content:counter(...) verbatim from getComputedStyle rather than the
  // resolved "1", so assert on the rendered circle: the content property is the
  // step counter, and the pseudo-element is a ~26px circle with a 1px border.
  const before = await firstH2.evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return {
      content: s.content,
      width: parseFloat(s.width),
      height: parseFloat(s.height),
      borderTopWidth: parseFloat(s.borderTopWidth),
      borderRadius: s.borderTopLeftRadius,
    };
  });
  // The counter that produces the step number.
  expect(before.content).toContain('counter(wdk-step)');
  // A circular badge of the design's 26px size, with a visible 1px border.
  expect(before.width).toBeCloseTo(26, 0);
  expect(before.height).toBeCloseTo(26, 0);
  expect(before.borderTopWidth).toBeGreaterThan(0);
  expect(before.borderRadius).not.toBe('0px');
});

test('an "On this page" rail (.wdk-toc) is present', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('.wdk-toc')).toBeVisible();
});

test('guide page has data-accent="lime"', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'lime');
});

test('the old scrollytelling code rail is absent', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('[data-code-rail]')).toHaveCount(0);
});

test('the title-accent bar and a min-read meta item render', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('.wdk-guide__title-accent')).toBeVisible();
  // The first meta item is the read-time estimate.
  await expect(page.locator('.wdk-guide__meta')).toContainText('min read');
});

// A second guide also routes through GuideArticleLayout: it gets the article
// header and numbered h2 steps, and has no scrollytelling code rail. Folded in
// from the retired guide-scrollytelling.spec.js, which only ever exercised the
// old scroll-synced code rail and is now a misnomer under the article layout.
test('send-a-payment renders the guide article with numbered steps', async ({ page }) => {
  await page.goto('/guides/send-a-payment/');
  await expect(page.locator('.wdk-guide__breadcrumb')).toBeVisible();
  const headings = page.locator('.wdk-guide__content h2');
  await expect(headings.first()).toBeVisible();
  expect(await headings.count()).toBeGreaterThan(1);
  await expect(page.locator('[data-code-rail]')).toHaveCount(0);
});
