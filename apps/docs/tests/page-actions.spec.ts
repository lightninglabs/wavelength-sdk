import { test, expect } from '@playwright/test';

const PAGE = '/guides/use-a-passkey/';

test('page actions trigger opens a menu with every action', async ({ page }) => {
  await page.goto(PAGE);
  const actions = page.locator('.wdk-page-actions');
  await expect(actions.getByRole('button', { name: /for agents/i })).toBeVisible();
  const menu = actions.locator('.wdk-page-actions__menu');
  await expect(menu).not.toHaveClass(/is-open/);

  await actions.getByRole('button', { name: /for agents/i }).click();
  await expect(menu).toHaveClass(/is-open/);
  await expect(menu.getByRole('menuitem', { name: /copy as markdown/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /copy url to markdown/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /view as markdown/i })).toHaveAttribute(
    'href',
    '/guides/use-a-passkey.md',
  );
});

test('copy as markdown puts the mirror on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(PAGE);
  const actions = page.locator('.wdk-page-actions');
  await actions.getByRole('button', { name: /for agents/i }).click();
  await actions.getByRole('menuitem', { name: /copy as markdown/i }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/^---\ntitle: /);
});

test('copy url to markdown puts the mirror url on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(PAGE);
  const actions = page.locator('.wdk-page-actions');
  await actions.getByRole('button', { name: /for agents/i }).click();
  await actions.getByRole('menuitem', { name: /copy url to markdown/i }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/\/guides\/use-a-passkey\.md$/);
});

test('open-in links target the ai providers with the md url', async ({ page }) => {
  await page.goto(PAGE);
  const actions = page.locator('.wdk-page-actions');
  await actions.getByRole('button', { name: /for agents/i }).click();
  const claude = actions.getByRole('menuitem', { name: /open in claude/i });
  const href = await claude.getAttribute('href');
  expect(href).toContain('claude.ai/new?q=');
  expect(decodeURIComponent(href!)).toContain('use-a-passkey.md');
});

test('menu closes on outside click and on Escape', async ({ page }) => {
  await page.goto(PAGE);
  const actions = page.locator('.wdk-page-actions');
  const menu = actions.locator('.wdk-page-actions__menu');

  await actions.getByRole('button', { name: /for agents/i }).click();
  await expect(menu).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveClass(/is-open/);

  await actions.getByRole('button', { name: /for agents/i }).click();
  await expect(menu).toHaveClass(/is-open/);
  await page.mouse.click(10, 10);
  await expect(menu).not.toHaveClass(/is-open/);
});

test('copy button still works after navigating away and back', async ({ page, context }) => {
  // The trigger's listeners are bound by an inline script. Astro's
  // ClientRouter restores a cached DOM snapshot when a reader revisits a
  // page they already rendered client-side, and that restore does not
  // re-run inline scripts against it. A listener bound only once, at
  // initial module-eval, would be missing from the button on this second,
  // client-side-cached visit. Navigate away with a real sidebar link click,
  // then back the same way, before exercising copy.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(PAGE);
  await page.locator('.wdk-sidebar').getByRole('link', { name: 'Activity and events' }).click();
  await expect(page).toHaveURL(/\/concepts\/activity-and-events\/$/);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));

  const actions = page.locator('.wdk-page-actions');
  await actions.getByRole('button', { name: /for agents/i }).click();
  await actions.getByRole('menuitem', { name: /copy as markdown/i }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/^---\ntitle: /);
});
