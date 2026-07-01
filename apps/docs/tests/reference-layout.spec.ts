import { test, expect } from '@playwright/test';

// Tests for the ReferenceLayout.
// Asserts that /reference/walletdk-core/ renders:
//   1. [data-symbol] sections - one per exported symbol.
//   2. A sticky symbol-list rail with one link per symbol.
//   3. data-accent="orange" on <html>.

test('reference page has data-accent="orange"', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange');
});

test('reference page renders [data-symbol] sections', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  // Expect at least two symbol sections.
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
});

test('sticky symbol-list rail is present', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const rail = page.locator('[data-symbol-list]');
  await expect(rail).toBeVisible();
});

test('symbol-list rail has one link per [data-symbol] section', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  const symbolCount = await symbols.count();
  // Count symbol links only; the rail also renders section-group labels
  // (.wdk-ref__rail-group) that mirror the "## " headings.
  const links = page.locator('[data-symbol-list] a.wdk-ref__rail-link');
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBe(symbolCount);
});

test('symbol-list links href targets match [data-symbol] section ids', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  // Collect all section ids.
  const ids = await symbols.evaluateAll((els) => els.map((el) => el.id));
  // Each link's href should end in #<id>.
  const links = page.locator('[data-symbol-list] a');
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  for (const id of ids) {
    expect(hrefs.some((h) => h === `#${id}`)).toBe(true);
  }
});

test('exactly one symbol link is .is-active on load', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');
  // Wait for client script initialisation (fires on astro:page-load).
  await expect(page.locator('[data-symbol-list] a.is-active')).toHaveCount(1);
});

// Smoke checks for the sibling reference pages.

test('walletdk-web reference page renders symbol sections, rail, and orange accent', async ({ page }) => {
  await page.goto('/web/reference/walletdk-web/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-symbol-list]')).toBeVisible();
});

test('walletdk-react reference page renders symbol sections, rail, and orange accent', async ({ page }) => {
  await page.goto('/web/reference/walletdk-react/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-symbol-list]')).toBeVisible();
});

// Signature code-block frame + indentation.
// Asserts the Signature component renders through the same Expressive Code
// frame as the guides (filename header visible), and that the rendered
// signature text is consistently 2-space indented.

test('reference signature code block renders an Expressive Code frame with a visible filename header', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');

  // The first symbol on the page is defaultConfig; its Signature block is
  // titled "walletdk-core.d.ts" so the frame's tab bar shows that filename.
  const tabBar = page.locator('.expressive-code .frame:not(.is-terminal) .title').first();
  await expect(tabBar).toBeVisible();
  await expect(tabBar).toHaveText('walletdk-core.d.ts');
});

test('reference signature code block has consistent 2-space indentation', async ({ page }) => {
  await page.goto('/reference/walletdk-core/');

  // The RuntimeConfig signature is a multi-line type; every field line
  // should be indented exactly 2 spaces (no ragged/misaligned whitespace).
  const configSymbol = page.locator('[data-symbol]#RuntimeConfig');
  const code = configSymbol.locator('.expressive-code code').first();
  await expect(code).toBeVisible();
  const lines = await code.locator('.ec-line .code').allTextContents();

  // Field lines (those that aren't the opening "interface ..." or closing "}")
  // must start with exactly two leading spaces and no extra interior padding
  // before the field name.
  const fieldLines = lines.filter((l) => /^\s*\w+[?]?:/.test(l));
  expect(fieldLines.length).toBeGreaterThanOrEqual(4);
  for (const line of fieldLines) {
    expect(line).toMatch(/^ {2}\S/);
  }
});

// Cross-reference client-navigation test.
// Proves the teardown fix: navigating from one reference page to another via a
// sidebar link must rebuild the rail with the new page's symbols, not leave
// stale links from the previous page.

test('symbol rail rebuilds after client-side reference->reference navigation', async ({ page }) => {
  // Start on walletdk-core and collect its symbol ids.
  await page.goto('/reference/walletdk-core/');
  const coreSymbols = page.locator('[data-symbol]');
  await expect(coreSymbols.first()).toBeVisible();
  const coreIds = await coreSymbols.evaluateAll((els) => els.map((el) => el.id));

  // Collect the rail hrefs for walletdk-core.
  const coreLinks = page.locator('[data-symbol-list] a');
  await expect(coreLinks.first()).toBeVisible();
  const coreHrefs = await coreLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));

  // Confirm the core rail links match the core symbol ids.
  for (const id of coreIds) {
    expect(coreHrefs.some((h) => h === `#${id}`)).toBe(true);
  }

  // Plant a window marker to confirm the navigation is client-side (no reload).
  await page.evaluate(() => { window.__wdkNoReload = true; });

  // Navigate to walletdk-web via the sidebar link (client-side view transition).
  await page.locator('.wdk-sidebar').getByRole('link', { name: 'walletdk-web' }).click();
  await expect(page).toHaveURL(/\/web\/reference\/walletdk-web\/$/);

  // Confirm it was a client-side swap, not a full reload.
  expect(await page.evaluate(() => window.__wdkNoReload === true)).toBe(true);

  // Wait for the new page's symbols to appear.
  const webSymbols = page.locator('[data-symbol]');
  await expect(webSymbols.first()).toBeVisible();
  const webIds = await webSymbols.evaluateAll((els) => els.map((el) => el.id));

  // Wait for the rail to be rebuilt (the script fires on astro:page-load).
  const webRailLinks = page.locator('[data-symbol-list] a');
  await expect(webRailLinks.first()).toBeVisible();
  const webHrefs = await webRailLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));

  // The rail must contain links for the new page's symbols.
  for (const id of webIds) {
    expect(webHrefs.some((h) => h === `#${id}`)).toBe(true);
  }

  // No stale walletdk-core links should remain in the rail.
  // A stale link would be one that targets a core symbol id but is not also a
  // web symbol id (i.e. it belongs only to the previous page).
  const staleHrefs = webHrefs.filter(
    (h) => coreIds.some((id) => h === `#${id}`) && !webIds.some((id) => h === `#${id}`)
  );
  expect(staleHrefs).toHaveLength(0);
});
