import { expect, test } from '@playwright/test';

const pagePath = '/introduction/what-is-wavelength-sdk/';

test('SDK package list uses a two-column card grid on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(pagePath);

  const list = page.locator('.wdk-package-list');
  await expect(list).toBeVisible();
  const cards = list.locator('.wdk-package-list__item');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().locator('.wdk-package-list__name')).toHaveText('@lightninglabs/wavelength-core');

  const columns = await list.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
});

test('SDK package cards use the established accent palette', async ({ page }) => {
  await page.goto(pagePath);

  const cards = page.locator('.wdk-package-list__item');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toHaveAttribute('data-accent', 'teal');
  await expect(cards.nth(1)).toHaveAttribute('data-accent', 'sky');
  await expect(cards.nth(2)).toHaveAttribute('data-accent', 'lime');
  await expect(cards.nth(3)).toHaveAttribute('data-accent', 'violet');
});

test('SDK package list presents labeled, full-width cards on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pagePath);

  const list = page.locator('.wdk-package-list');
  const cards = list.locator('.wdk-package-list__item');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().locator('.wdk-package-list__name')).toHaveText('@lightninglabs/wavelength-core');
  await expect(cards.first().locator('.wdk-package-list__role')).toContainText('Shared types');

  const layout = await cards.first().evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const list = card.closest('.wdk-package-list')!;
    return {
      display: getComputedStyle(list).display,
      columns: getComputedStyle(list).gridTemplateColumns.split(' ').length,
      width: rect.width,
      listWidth: list.getBoundingClientRect().width,
    };
  });
  expect(layout.display).toBe('grid');
  expect(layout.columns).toBe(1);
  expect(layout.width).toBeLessThanOrEqual(layout.listWidth);
});
