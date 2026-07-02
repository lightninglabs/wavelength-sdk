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

  // Should match the site's --surface-3 token, converted to rgb. Not
  // --surface-2: in light mode that resolves to pure white, identical to
  // vitesse-light's own code background, leaving the header indistinguishable
  // from the code body below it.
  const surface3 = await cssVar(page, '--surface-3');
  const expected = await page.evaluate((hex) => {
    const div = document.createElement('div');
    div.style.color = hex;
    document.body.appendChild(div);
    const rgb = getComputedStyle(div).color;
    div.remove();
    return rgb;
  }, surface3);
  expect(bg).toBe(expected);
});

test('the frame header background is visibly distinct from the code body in light mode', async ({ page }) => {
  // In light mode --surface-2 (the header's old background) is pure white,
  // identical to vitesse-light's own code background: the header and the
  // code body were the same color, and the border between them (--border,
  // a near-white gray) was nearly invisible against two white surfaces.
  // Assert the two backgrounds actually differ, not just that each one
  // individually resolves to a real color.
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto(PAGE);
  await goLight(page);

  const frame = page.locator('.expressive-code .frame').first();
  const headerBg = await frame.locator('.header').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const codeBg = await frame.locator('pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headerBg).not.toBe(codeBg);
});

test('code block background follows the site theme toggle, not the OS color scheme', async ({ page }) => {
  // Expressive Code's default themeCssSelector keys off the literal Shiki
  // theme name (e.g. [data-theme='vitesse-light']), which never matches the
  // site's own data-theme='light' attribute. Before ec.config.mjs mapped
  // themeCssSelector to each theme's `type`, code blocks fell through to
  // Expressive Code's separate `prefers-color-scheme` media-query fallback
  // instead: it happened to match whenever the OS scheme agreed with the
  // site toggle, hiding the bug. Force them to disagree (dark OS, site
  // toggled to light) so this test would fail without the fix and does not
  // depend on the browser's default color scheme.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto(PAGE);
  await goLight(page);

  const pre = page.locator('.expressive-code pre').first();
  const bg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor);

  // Should match the site's light-mode --surface token (the code background
  // override in ec.config.mjs), not the dark palette's --surface.
  const surface = await cssVar(page, '--surface');
  const expected = await page.evaluate((hex) => {
    const div = document.createElement('div');
    div.style.color = hex;
    document.body.appendChild(div);
    const rgb = getComputedStyle(div).color;
    div.remove();
    return rgb;
  }, surface);
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

  // See the dark-mode terminal test above: --surface-3, not --surface-2,
  // which is indistinguishable from the code body's own white background.
  const surface3 = await cssVar(page, '--surface-3');
  const expected = await page.evaluate((hex) => {
    const div = document.createElement('div');
    div.style.color = hex;
    document.body.appendChild(div);
    const rgb = getComputedStyle(div).color;
    div.remove();
    return rgb;
  }, surface3);
  expect(bg).toBe(expected);
});
