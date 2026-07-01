import { test, expect } from '@playwright/test';

// Verify canonical URL and Open Graph meta tags are present and correct on
// representative pages. These are server-rendered head tags; crawlers rely on
// them without executing JavaScript.

const BASE_URL = 'https://dadocs.lightning.engineering';

const pages = [
  { path: '/', label: 'home' },
  { path: '/introduction/what-is-walletdk/', label: 'introduction doc' },
];

for (const { path, label } of pages) {
  test(`${label}: has exactly one canonical link matching its absolute URL`, async ({ page }) => {
    await page.goto(path);

    const canonicals = page.locator('link[rel="canonical"]');
    await expect(canonicals).toHaveCount(1);

    const href = await canonicals.getAttribute('href');
    const expected = `${BASE_URL}${path}`;
    expect(href).toBe(expected);
  });

  test(`${label}: og:title is present and non-empty`, async ({ page }) => {
    await page.goto(path);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveCount(1);

    const content = await ogTitle.getAttribute('content');
    expect(content).toBeTruthy();
    expect((content ?? '').length).toBeGreaterThan(0);
  });

  test(`${label}: og:url matches the canonical URL`, async ({ page }) => {
    await page.goto(path);

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveCount(1);

    const content = await ogUrl.getAttribute('content');
    const expected = `${BASE_URL}${path}`;
    expect(content).toBe(expected);
  });

  test(`${label}: twitter:card is present`, async ({ page }) => {
    await page.goto(path);

    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveCount(1);

    const content = await twitterCard.getAttribute('content');
    expect(content).toBeTruthy();
  });
}
