import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmsTxt, buildLlmsFullTxt, SECTIONS } from './llms.ts';
import { flattenNav } from '../../src/config/nav.ts';
import type { PageRecord } from './index.ts';

function fixturePages(): PageRecord[] {
  // Real PageRecord markdown begins with the page's own h1 (the layouts
  // render it inside the pagefind body), so the fixtures do too.
  return SECTIONS.flatMap((section) =>
    flattenNav(section.nav).map((item) => ({
      route: `/${item.slug}/`,
      title: item.label,
      description: `About ${item.label}.`,
      markdown: `# ${item.label}\n\nBody of ${item.label}.\n`,
    })),
  );
}

test('llms.txt is spec-shaped and nav-ordered', () => {
  const out = buildLlmsTxt(fixturePages());
  assert.match(out, /^# WalletDK\n/);
  assert.match(out, /^> /m);
  for (const section of SECTIONS) {
    assert.match(out, new RegExp(`^## ${section.label}$`, 'm'));
  }
  assert.match(out, /^- \[.+\]\(https:\/\/.+\.md\): .+$/m);
});

test('llms.txt fails loudly on a missing page', () => {
  const pages = fixturePages().slice(1);
  assert.throws(() => buildLlmsTxt(pages), /no markdown mirror/);
});

test('llms.txt fails loudly on a missing description', () => {
  const pages = fixturePages();
  pages[0] = { ...pages[0], description: null };
  assert.throws(() => buildLlmsTxt(pages), /missing a description/);
});

test('llms-full concatenates every nav page in order', () => {
  const out = buildLlmsFullTxt(fixturePages());
  const flat = SECTIONS.flatMap((s) => flattenNav(s.nav));
  const first = out.indexOf(`# ${flat[0].label}\n`);
  const last = out.indexOf(`# ${flat[flat.length - 1].label}\n`);
  assert.ok(first !== -1 && last !== -1 && first < last, 'pages appear in nav order');
  assert.match(out, /Body of /);
  assert.match(out, /^Source: https:\/\/.+\.md$/m);
});
