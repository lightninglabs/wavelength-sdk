// Verifies that fenced code blocks with a `title="..."` attribute render an
// Expressive Code frame whose header shows the filename, and that the frame
// header background resolves to a real (non-transparent) surface color in
// both the default (dark) and light site themes.
import { test, expect } from '@playwright/test';
import { cssVar, goLight } from './helpers';

const PAGE = '/web/get-started/installation/';

test('titled bash block renders an Expressive Code frame with the filename in the header', async ({ page }) => {
  await page.goto(PAGE);

  // The terminal frame title bar shows the title text used in the fence.
  const terminalTitle = page.locator('.expressive-code .frame.is-terminal .title').first();
  await expect(terminalTitle).toBeVisible();
  await expect(terminalTitle).toHaveText('Terminal');
});

test('titled ts block renders an Expressive Code frame with the filename in the header', async ({ page }) => {
  await page.goto(PAGE);

  // The editor frame shows the title in its tab bar.
  await expect(page.getByText('App.tsx')).toBeVisible();
});

test('terminal frame header background is a non-transparent surface color in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(PAGE);

  const header = page.locator('.expressive-code .frame.is-terminal .header').first();
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');

  // Should match the site's --surface-2 token, converted to rgb.
  const surface2 = await cssVar(page, '--surface-2');
  const expected = await page.evaluate((hex) => {
    const div = document.createElement('div');
    div.style.color = hex;
    document.body.appendChild(div);
    const rgb = getComputedStyle(div).color;
    div.remove();
    return rgb;
  }, surface2);
  expect(bg).toBe(expected);
});

test('editor frame header background is a non-transparent surface color in light mode', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto(PAGE);
  await page.emulateMedia({ colorScheme: 'light' });
  await goLight(page);

  // The active tab (the filename chip) paints a flat background-color, while
  // the surrounding .header bar paints its background via a gradient image
  // (used to draw the bottom border line) - so assert on the tab itself.
  const tabBar = page.locator('.expressive-code .frame:not(.is-terminal) .title').first();
  const bg = await tabBar.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');

  const surface2 = await cssVar(page, '--surface-2');
  const expected = await page.evaluate((hex) => {
    const div = document.createElement('div');
    div.style.color = hex;
    document.body.appendChild(div);
    const rgb = getComputedStyle(div).color;
    div.remove();
    return rgb;
  }, surface2);
  expect(bg).toBe(expected);
});
