import { test, expect } from '@playwright/test';
import { cssVar, goLight, normHex } from './helpers';

/**
 * Light-palette QA.
 *
 * Asserts:
 *   1. --header-height and --sidebar-w CSS tokens resolve on every layout.
 *   2. Accents used as text or thin rules in light mode are not the raw
 *      low-contrast lime (#c9f000) or other unreadable values.
 *   3. Inline code chips (surface-2) are not the dark hex fallback #24242a
 *      in light mode.
 */

// ---- Token extraction tests ------------------------------------------------

test('--header-height token resolves on a doc page', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  const val = await cssVar(page, '--header-height');
  expect(val.trim()).toBe('56px');
});

test('--sidebar-w token resolves on a doc page', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');
  const val = await cssVar(page, '--sidebar-w');
  expect(val.trim()).toBe('256px');
});

test('--header-height token resolves on the home page', async ({ page }) => {
  await page.goto('/');
  const val = await cssVar(page, '--header-height');
  expect(val.trim()).toBe('56px');
});

test('--sidebar-w token resolves on the quickstart page', async ({ page }) => {
  await page.goto('/web/get-started/quickstart/');
  const val = await cssVar(page, '--sidebar-w');
  expect(val.trim()).toBe('256px');
});

// ---- Light mode contrast tests ---------------------------------------------

test('lime active sidebar link is not raw #c9f000 in light mode', async ({ page }) => {
  // Navigate to a guides page (lime section).
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto('/guides/create-a-wallet/');

  await page.emulateMedia({ colorScheme: 'light' });
  await goLight(page);

  // The active sidebar link for a lime-accented page should use the darker
  // accent-lime token, not the vivid fill #c9f000.
  const activeLink = page.locator('.wdk-sidebar__link--active.wdk-sidebar__link--lime');
  const count = await activeLink.count();
  if (count > 0) {
    const color = await activeLink.evaluate(
      (el) => getComputedStyle(el).color,
    );
    // rgb(201, 240, 0) is #c9f000 - should NOT appear as text in light mode.
    expect(color).not.toContain('201, 240, 0');
  }
});

test('h2 underline accent for lime pages is not #c9f000 in light mode', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto('/guides/create-a-wallet/');
  await page.emulateMedia({ colorScheme: 'light' });
  await goLight(page);

  // --accent-lime in light mode should not be the vivid lime.
  const accentLime = await cssVar(page, '--accent-lime');
  expect(normHex(accentLime)).not.toBe('#c9f000');
});

test('inline code chip background is not the dark surface #24242a in light mode', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto('/concepts/balances-and-vtxos/');
  await page.emulateMedia({ colorScheme: 'light' });
  await goLight(page);

  // --surface-2 in light mode should be a light color (white/near-white).
  const surface2 = await cssVar(page, '--surface-2');
  // #24242a is the dark fallback - must not be present in light mode.
  expect(normHex(surface2)).not.toBe('#24242a');
  // Sanity: it should be exactly white (#ffffff).
  expect(normHex(surface2)).toBe('#ffffff');
});

test('--bg in dark mode is the dark palette value', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/concepts/balances-and-vtxos/');
  const bg = await cssVar(page, '--bg');
  expect(normHex(bg)).toBe('#141417');
});

test('--bg in light mode is the light palette value', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto('/concepts/balances-and-vtxos/');
  await page.emulateMedia({ colorScheme: 'light' });
  await goLight(page);
  const bg = await cssVar(page, '--bg');
  expect(normHex(bg)).toBe('#ffffff');
});

// ---- #f472b6 token extraction test -----------------------------------------

test('--accent-pink token resolves in dark mode', async ({ page }) => {
  // Use dark system preference so the dark palette is active.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const val = await cssVar(page, '--accent-pink');
  // Dark mode --accent-pink should be the original vivid pink.
  expect(normHex(val)).toBe('#f472b6');
});

test('--accent-pink token is darkened in light mode (readable on white)', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('wdk-theme', 'light'); } catch {} });
  await page.goto('/');
  await goLight(page);
  const val = await cssVar(page, '--accent-pink');
  // Light mode uses the darker variant - not the vivid #f472b6.
  expect(normHex(val)).not.toBe('#f472b6');
});

// ---- Dark mode accent contrast tests ---------------------------------------
// --accent-violet and --accent-orange were raised to #a78bfa and #ffa733 for
// WCAG contrast against the dark --bg (#141417): violet was 3.08:1 (AA
// failure), orange was borderline readable. Pin the lightened values so a
// future edit can't silently regress readability.

test('--accent-violet in dark mode is not the low-contrast original #7a2ff2', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const val = await cssVar(page, '--accent-violet');
  expect(normHex(val)).not.toBe('#7a2ff2');
  expect(normHex(val)).toBe('#a78bfa');
});

test('--accent-orange in dark mode is not the original #f7920e', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const val = await cssVar(page, '--accent-orange');
  expect(normHex(val)).not.toBe('#f7920e');
  expect(normHex(val)).toBe('#ffa733');
});
