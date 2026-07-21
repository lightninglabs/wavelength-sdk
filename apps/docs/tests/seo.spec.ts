import { test, expect } from '@playwright/test';

// Verify canonical URL and Open Graph meta tags are present and correct on
// representative pages. These are server-rendered head tags; crawlers rely on
// them without executing JavaScript.

const BASE_URL = 'https://wavelength.lightning.engineering';

const pages = [
  { path: '/', label: 'home' },
  { path: '/introduction/what-is-wavelength-sdk/', label: 'introduction doc' },
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

  test(`${label}: og:image and twitter:image are the absolute share card URL`, async ({
    page,
  }) => {
    await page.goto(path);

    const expected = `${BASE_URL}/og/share-card.png`;
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
      const tag = page.locator(selector);
      await expect(tag).toHaveCount(1);
      // Scrapers do not resolve relative paths, so the URL must be absolute.
      expect(await tag.getAttribute('content')).toBe(expected);
    }
  });
}

test('the share card asset is served at the URL the meta tags advertise', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const url = await page
    .locator('meta[property="og:image"]')
    .getAttribute('content');

  // Re-request against the local preview: the meta tag carries the production
  // origin, but the asset has to exist in this build for the card to render.
  const response = await request.get(new URL(url ?? '').pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
});
