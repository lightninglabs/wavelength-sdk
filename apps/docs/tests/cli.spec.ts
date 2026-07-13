import { test, expect } from '@playwright/test';
import { flattenNav, CLI_NAV } from '../src/config/nav.ts';

test('every CLI nav entry resolves', async ({ page }) => {
  for (const item of flattenNav(CLI_NAV)) {
    const res = await page.goto(`/${item.slug}/`);
    expect(res!.status(), item.slug).toBe(200);
  }
});

test('cli index documents global flags and exit codes', async ({ page }) => {
  await page.goto('/cli/');
  await expect(page.getByText('--rpcserver')).toBeVisible();
  // --no-tls also appears inside the regtest callout ("--no-tls --no-macaroons"),
  // so match the flags-table cell exactly to stay unambiguous.
  await expect(page.getByText('--no-tls', { exact: true })).toBeVisible();
  await expect(page.getByText('--macaroonpath')).toBeVisible();
  await expect(page.getByText('exit code', { exact: false }).first()).toBeVisible();
});

test('every command page has uniform Flags and Example sections', async ({ page }) => {
  // Pages whose top-level command is a pure dispatcher (no bespoke flags of
  // its own) still get a Flags section (listing --help and the inherited
  // global flags) and an Example section (showing a representative
  // subcommand invocation), matching every other CLI page.
  for (const slug of ['ark', 'recovery', 'mcp', 'dev']) {
    await page.goto(`/cli/${slug}/`);
    await expect(page.getByRole('heading', { name: 'Flags', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Example', exact: true })).toBeVisible();
  }
});

test('subtree pages list subcommand headings in the table of contents', async ({ page }) => {
  // ark groups 8 top-level subcommand groups (## vtxos, ## rounds, ...) with
  // nested leaves (### vtxos list, ### vtxos refresh, ...); the TOC picks up
  // both depth-2 and depth-3 headings.
  await page.goto('/cli/ark/');
  const arkHeadings = page.locator('.wdk-doc__content h2, .wdk-doc__content h3');
  expect(await arkHeadings.count()).toBeGreaterThanOrEqual(17);
  await expect(page.getByRole('heading', { name: 'vtxos list' })).toBeVisible();
  await expect(page.locator('.wdk-toc__item', { hasText: 'vtxos list' })).toBeVisible();

  // recovery wraps its 4 subcommands under "## Subcommands", each its own h3.
  await page.goto('/cli/recovery/');
  await expect(page.getByRole('heading', { name: 'Subcommands', exact: true })).toBeVisible();
  const recoverySubcommands = page.locator('.wdk-doc__content h3');
  expect(await recoverySubcommands.count()).toBeGreaterThanOrEqual(4);
});

test('command pages cross-link to their RPC pages', async ({ page }) => {
  await page.goto('/cli/balance/');
  await expect(page.locator('a[href="/api/wallet/balance/"]')).toBeVisible();
});

test('bash example blocks render as a labeled terminal frame', async ({ page }) => {
  // Plain ```bash fences with no title render Expressive Code's terminal
  // frame with just three window dots and no visible label. Every CLI page's
  // bash examples carry title="Terminal" so the frame reads as a terminal.
  await page.goto('/cli/balance/');
  const terminalTitle = page.locator('.expressive-code .frame.is-terminal .title').first();
  await expect(terminalTitle).toBeVisible();
  await expect(terminalTitle).toHaveText('Terminal');
});
