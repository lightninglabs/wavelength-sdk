import { test, expect } from '@playwright/test';

// The search modal is backed by Pagefind, which only exists in the built site
// served by `astro preview` (the Playwright webServer). Every assertion below
// therefore runs against the real index, not a dev-server stub.

test('Cmd/Ctrl-K opens the search modal, finds results, and Escape closes it', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');

  const modal = page.getByRole('dialog', { name: /search/i });
  await expect(modal).toBeHidden();

  // The global keydown listener opens the modal. The shortcut may be pressed
  // before the client:idle island has hydrated, so retry until the modal is
  // visible (same pattern as theme.spec.js and client-routing.spec.js).
  await expect(async () => {
    await page.keyboard.press('Control+KeyK');
    await expect(modal).toBeVisible();
  }).toPass({ timeout: 5000 });

  // Typing a common term should surface at least one indexed page.
  const input = modal.getByRole('searchbox');
  await input.fill('wallet');
  await expect(modal.locator('[data-search-result]').first()).toBeVisible({ timeout: 5000 });
  expect(await modal.locator('[data-search-result]').count()).toBeGreaterThanOrEqual(1);

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('the header search button opens the modal', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');

  const modal = page.getByRole('dialog', { name: /search/i });
  await expect(modal).toBeHidden();

  // The button only dispatches the open event; the client:load island may not
  // have hydrated and attached its listener yet, so retry until the modal is
  // visible (same pattern as the shortcut test).
  const button = page.getByRole('button', { name: /^search/i });
  await expect(async () => {
    await button.click();
    await expect(modal).toBeVisible();
  }).toPass({ timeout: 5000 });

  // Backdrop click closes it.
  await page.locator('[data-search-backdrop]').click({ position: { x: 5, y: 5 } });
  await expect(modal).toBeHidden();
});

test('search still opens after a client-side navigation', async ({ page }) => {
  await page.goto('/concepts/balances-and-vtxos/');

  // Navigate client-side (view transition swaps the body).
  await page.locator('.wdk-sidebar').getByRole('link', { name: 'Activity and events' }).click();
  await expect(page).toHaveURL(/\/concepts\/activity-and-events\/$/);

  const modal = page.getByRole('dialog', { name: /search/i });
  // The global listeners must survive the body swap. The shortcut only
  // dispatches an event, which is lost if it lands before the persisted
  // client:load island is listening again (more likely under full-suite load),
  // so retry the press until the modal opens, same pattern as the initial-load
  // shortcut test above.
  await expect(async () => {
    await page.keyboard.press('Control+KeyK');
    await expect(modal).toBeVisible();
  }).toPass({ timeout: 5000 });
});
