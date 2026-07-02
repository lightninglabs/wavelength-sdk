import { test, expect } from '@playwright/test';
import { flattenNav } from '../src/config/nav';
import { SECTIONS } from '../scripts/agent-artifacts/llms';

test('llms.txt is served and spec-shaped', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/^# WalletDK/);
  for (const section of SECTIONS) {
    expect(body).toContain(`## ${section.label}`);
  }
});

test('llms-full.txt is served and within budget', async ({ request }) => {
  const res = await request.get('/llms-full.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.length).toBeGreaterThan(10_000);
  expect(body.length).toBeLessThan(700 * 1024);
});

test('every nav page has both markdown mirrors', async ({ request }) => {
  const slugs = SECTIONS.flatMap((s) => flattenNav(s.nav)).map((i) => i.slug);
  for (const slug of slugs) {
    for (const url of [`/${slug}.md`, `/${slug}/index.md`]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      const body = await res.text();
      expect(body, url).toMatch(/^---\ntitle: /);
      expect(body, url).toContain('canonical: ');
    }
  }
});

test('well-known skills catalog and files are served', async ({ request }) => {
  const res = await request.get('/.well-known/skills/index.json');
  expect(res.status()).toBe(200);
  const catalog = await res.json();
  expect(catalog.skills.map((s: { name: string }) => s.name).sort()).toEqual([
    'walletdk-api',
    'walletdk-cli',
    'walletdk-web',
  ]);
  for (const s of catalog.skills) {
    const file = await request.get(`/.well-known/skills/${s.name}/SKILL.md`);
    expect(file.status(), s.name).toBe(200);
    expect(await file.text()).toContain(`name: ${s.name}`);
  }
});

test('mirrors contain converted content, not html', async ({ request }) => {
  const res = await request.get('/web/guides/use-a-passkey.md');
  const body = await res.text();
  // Code samples may legitimately contain HTML-shaped text; the leak check
  // targets prose and structure outside code.
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  expect(prose).not.toMatch(/<div|<astro-island|class=/);
});

test('agents page renders the hub content', async ({ page }) => {
  await page.goto('/agents/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build with agents');
  await expect(page.getByText('npx skills add lightninglabs/dawallet').first()).toBeVisible();
  await expect(page.locator('.wdk-prompt-tabs__strip button')).toHaveCount(3);
  await page.locator('.wdk-prompt-tabs__strip button').nth(1).click();
  await expect(page.getByText('gRPC or REST').first()).toBeVisible();
});

test('agents page tab strip still works after client-side navigation', async ({ page }) => {
  // Land on /agents/ once, navigate away, then back: a real reader clicking
  // between pages, not page.goto. The tab strip is built by a script that
  // runs eagerly at module-eval, which is enough on a *first* visit but not
  // on a *repeat* client-side visit, because ClientRouter restores a cached
  // DOM snapshot for a previously-rendered page and does not re-run inline
  // scripts against it. Without an astro:page-load handler, this second
  // visit renders an empty strip with every panel showing.
  await page.goto('/agents/');
  await expect(page.locator('.wdk-prompt-tabs__strip button')).toHaveCount(3);

  // Drive the clicks via the DOM API rather than Playwright's pointer-based
  // click: the links are appended to document.body, which the fixed sidebar
  // overlays, so a real in-DOM click event (still intercepted by
  // ClientRouter exactly as a reader's click would be) avoids relying on
  // element visibility/stability.
  await page.evaluate(() => {
    const away = document.createElement('a');
    away.href = '/concepts/balances-and-vtxos/';
    away.id = 'wdk-test-away-link';
    document.body.appendChild(away);
    away.click();
  });
  await expect(page).toHaveURL(/\/concepts\/balances-and-vtxos\/$/);

  await page.evaluate(() => {
    const back = document.createElement('a');
    back.href = '/agents/';
    back.id = 'wdk-test-agents-link';
    document.body.appendChild(back);
    back.click();
  });
  await expect(page).toHaveURL(/\/agents\/$/);

  await expect(page.locator('.wdk-prompt-tabs__strip button')).toHaveCount(3);
  await page.locator('.wdk-prompt-tabs__strip button').nth(1).click();
  await expect(page.getByText('gRPC or REST').first()).toBeVisible();
});

test('agents page markdown mirror keeps all three prompts', async ({ request }) => {
  const res = await request.get('/agents.md');
  expect(res.status()).toBe(200);
  const body = await res.text();
  // The tab labels live in data-label attributes stripped by the converter;
  // assert on content unique to each panel instead so we still confirm the
  // markdown mirror kept all three prompts as plain content.
  expect(body).toContain('mount <WalletDKProvider');
  expect(body).toContain('gRPC or REST');
  expect(body).toContain('Write automation for the WalletDK wallet using darepocli.');
  expect(body).toContain('darepocli mcp');
});
