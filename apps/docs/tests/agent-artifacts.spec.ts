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
  expect(body.length).toBeLessThan(500 * 1024);
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
