import { test, expect } from '@playwright/test';

// Tests for the ReferenceLayout.
// Asserts that /reference/wavelength-core/ renders:
//   1. [data-symbol] sections - one per exported symbol.
//   2. A sticky symbol-list rail with one link per symbol.
//   3. data-accent="teal" on <html>.

test('reference page has data-accent="teal"', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
});

test('reference page renders [data-symbol] sections', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  // Expect at least two symbol sections.
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
});

test('sticky symbol-list rail is present', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');
  const rail = page.locator('[data-symbol-list]');
  await expect(rail).toBeVisible();
});

test('symbol-list rail has one link per [data-symbol] section', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');
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
  await page.goto('/reference/wavelength-core/');
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
  await page.goto('/reference/wavelength-core/');
  // Wait for client script initialisation (fires on astro:page-load).
  await expect(page.locator('[data-symbol-list] a.is-active')).toHaveCount(1);
});

test('reference type badges link to their documented API symbols', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');

  const factory = page.locator('[data-symbol]#createWalletEngine');
  await expect(factory.locator('.param-type-link').first()).toHaveAttribute(
    'href',
    '/reference/wavelength-core/#WalletEngineOptions',
  );
  await expect(factory.locator('.wdk-returns__type-link')).toHaveAttribute(
    'href',
    '/reference/wavelength-core/#WalletEngine',
  );

  // Literal and compound labels stay plain code rather than becoming noisy
  // links with an imprecise destination.
  await expect(factory.locator('.param-type-link')).toHaveCount(3);
  await expect(
    factory.locator('.param-type').filter({ hasText: 'true | false' }).locator('.param-type-link'),
  ).toHaveCount(0);
});

test('authored reference links use the same visible prose treatment', async ({ page }) => {
  await page.goto('/reference/wavelength-react-native/');

  const link = page.locator('.wdk-ref__content a[href*="WavelengthClient"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveCSS('border-bottom-style', 'none');
  await expect(link).toHaveCSS('text-decoration-line', 'none');
});

test('inline result types have exact deep-link anchors', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');

  for (const name of ['DepositResult', 'ExitResult', 'ExitStatusResult', 'WalletEngineOptions']) {
    await expect(page.locator(`#${name}`)).toBeVisible();
    await expect(page.locator(`[data-symbol]#${name}`)).toBeVisible();
    await expect(page.locator(`[data-symbol-list] a[href="#${name}"]`)).toBeVisible();
  }
});

test('inline type rail links navigate to the requested definition', async ({ page }) => {
  await page.goto('/reference/wavelength-core/#DepositResult');
  await expect(page).toHaveURL(/\/reference\/wavelength-core\/#DepositResult$/);
  await expect(page.locator('[data-symbol]#DepositResult')).toBeVisible();
  await expect(page.locator('[data-symbol-list] a[href="#DepositResult"]')).toHaveClass(/is-active/);
  await expect.poll(async () => page.locator('#DepositResult').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(140);
});

test('in-page hash changes realign the requested inline type', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => { window.location.hash = 'DepositResult'; });
  await expect.poll(async () => page.locator('#DepositResult').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(140);
  await expect(page.locator('[data-symbol-list] a[href="#DepositResult"]')).toHaveClass(/is-active/);
});

test('public nested and lifecycle types have reference sections', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');

  for (const name of [
    'ActivityStreamPayload',
    'ActivityStreamState',
    'WalletPhase',
    'ServerTransport',
    'MobileConfig',
    'VTXOInventory',
    'OnchainHistory',
  ]) {
    await expect(page.locator(`#${name}`)).toBeVisible();
  }
});

// Smoke checks for the sibling reference pages.

test('wavelength-web reference page renders symbol sections, rail, and teal accent', async ({ page }) => {
  await page.goto('/reference/wavelength-web/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-symbol-list]')).toBeVisible();
});

test('wavelength-react reference page renders symbol sections, rail, and teal accent', async ({ page }) => {
  await page.goto('/reference/wavelength-react/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  const symbols = page.locator('[data-symbol]');
  await expect(symbols.first()).toBeVisible();
  expect(await symbols.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-symbol-list]')).toBeVisible();
});

test('wavelength-react-native reference page renders symbol sections, rail, and teal accent', async ({ page }) => {
  await page.goto('/reference/wavelength-react-native/');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
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
  await page.goto('/reference/wavelength-core/');

  // The first reference symbol's Signature block is titled
  // "wavelength-core.d.ts", so the frame's tab bar shows that filename.
  const tabBar = page.locator('.expressive-code .frame:not(.is-terminal) .title').first();
  await expect(tabBar).toBeVisible();
  await expect(tabBar).toHaveText('wavelength-core.d.ts');
});

test('reference signature code block has consistent 2-space indentation', async ({ page }) => {
  await page.goto('/reference/wavelength-core/');

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
  // Start on wavelength-core and collect its symbol ids.
  await page.goto('/reference/wavelength-core/');
  const coreSymbols = page.locator('[data-symbol]');
  await expect(coreSymbols.first()).toBeVisible();
  const coreIds = await coreSymbols.evaluateAll((els) => els.map((el) => el.id));

  // Collect the rail hrefs for wavelength-core.
  const coreLinks = page.locator('[data-symbol-list] a');
  await expect(coreLinks.first()).toBeVisible();
  const coreHrefs = await coreLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href')));

  // Confirm the core rail links match the core symbol ids.
  for (const id of coreIds) {
    expect(coreHrefs.some((h) => h === `#${id}`)).toBe(true);
  }

  // Plant a window marker to confirm the navigation is client-side (no reload).
  await page.evaluate(() => { window.__wdkNoReload = true; });

  // Navigate to wavelength-web via the sidebar link (client-side view transition).
  await page.locator('.wdk-sidebar').getByRole('link', { name: 'wavelength-web' }).click();
  await expect(page).toHaveURL(/\/reference\/wavelength-web\/$/);

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

  // No stale wavelength-core links should remain in the rail.
  // A stale link would be one that targets a core symbol id but is not also a
  // web symbol id (i.e. it belongs only to the previous page).
  const staleHrefs = webHrefs.filter(
    (h) => coreIds.some((id) => h === `#${id}`) && !webIds.some((id) => h === `#${id}`)
  );
  expect(staleHrefs).toHaveLength(0);
});
