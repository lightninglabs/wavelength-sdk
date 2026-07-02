import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiDocSchema } from '../src/data/api/schema.ts';

const doc = apiDocSchema.parse(
  JSON.parse(readFileSync(new URL('../src/data/api/wallet.json', import.meta.url), 'utf8')),
);

test('every method page resolves with its method name as the title', async ({ page }) => {
  for (const m of doc.methods) {
    const res = await page.goto(`/api/wallet/${m.slug}/`);
    expect(res!.status(), m.slug).toBe(200);
    await expect(page.locator('h1')).toHaveText(m.name);
  }
});

test('prepare-send page shows endpoints, tabs, and field tables', async ({ page }) => {
  await page.goto('/api/wallet/prepare-send/');
  await expect(page.getByText('/v1/wallet/prepare-send')).toBeVisible();
  await expect(page.getByText('rpc PrepareSend', { exact: false })).toBeVisible();
  // Request field table includes the oneof members and amt_sat.
  await expect(page.locator('[data-field-row="amt_sat"]')).toBeVisible();
  await expect(page.locator('[data-field-row="invoice"]')).toBeVisible();
  // Tabs switch panels. The Python sample references wallet_pb2_grpc on two
  // lines and Shiki wraps each in its own token span, so getByText resolves to
  // two elements; .first() keeps the assertion (the Python panel is shown after
  // clicking Python) without a strict-mode violation on the duplicated token.
  await page.getByRole('tab', { name: 'Python' }).click();
  await expect(page.getByText('wallet_pb2_grpc').first()).toBeVisible();
});

test('a proto3 optional field is marked as optional in its field table', async ({ page }) => {
  // WalletEntry.failure_code is a proto3 `optional` field (synthetic oneof,
  // not a real oneof), reached via inspect-activity's referencedTypes.
  await page.goto('/api/wallet/inspect-activity/');
  const row = page.locator('[data-field-row="failure_code"]');
  await expect(row).toBeVisible();
  await expect(row.getByText('optional', { exact: true })).toBeVisible();
});

test('streaming method is labeled and cli chip links into the cli slice', async ({ page }) => {
  await page.goto('/api/wallet/subscribe-wallet/');
  await expect(page.getByText('server streaming', { exact: false })).toBeVisible();
  await page.goto('/api/wallet/balance/');
  const chip = page.locator('a[href="/cli/balance/"]');
  await expect(chip).toBeVisible();
});

test('method pages use the api sidebar and highlight the active item', async ({ page }) => {
  await page.goto('/api/wallet/create/');
  await expect(page.locator('.wdk-sidebar a[aria-current="page"]')).toHaveText('Create');
  await expect(page.locator('.wdk-sidebar').getByText('Wallet lifecycle')).toBeVisible();
});

test('the on-this-page rail shortens to the footer top instead of overlapping it', async ({ page }) => {
  await page.goto('/api/wallet/prepare-send/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(async () => {
    const railBottom = await page.locator('.wdk-api__rail').evaluate((el) => el.getBoundingClientRect().bottom);
    const footerTop = await page.locator('.wdk-footer').evaluate((el) => el.getBoundingClientRect().top);
    expect(railBottom).toBeCloseTo(footerTop, 0);
  }).toPass({ timeout: 3000 });
});
