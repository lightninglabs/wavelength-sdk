// A callout is an interruption: the border, tint, and title are calibrated to
// make a reader stop for a short aside. Used as a container for a whole
// subsection it stops reading as an aside and becomes a wall of boxed text,
// and because it carries no heading it also cannot be linked or navigated to.
//
// Two callouts had grown to ~300 words before this test existed, one of them
// with six paragraph-length bullets, and one of those was the target of a
// dozen "see the convention above" cross-references that could not be links.
// Long-form content belongs in a section with a heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('./docs/', import.meta.url));

/** Every .mdx file under src/content/docs, recursively. */
function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return mdxFiles(full);
    return full.endsWith('.mdx') ? [full] : [];
  });
}

/**
 * The body of every <Callout> in a file. Callouts do not nest, so a
 * non-greedy match between the opening and closing tag is sufficient.
 */
function calloutBodies(source: string): { title: string; words: number }[] {
  const out: { title: string; words: number }[] = [];
  const re = /<Callout\b([^>]*)>([\s\S]*?)<\/Callout>/g;
  for (const match of source.matchAll(re)) {
    const title = /title="([^"]*)"/.exec(match[1])?.[1] ?? '(untitled)';
    const words = match[2].trim().split(/\s+/).filter(Boolean).length;
    out.push({ title, words });
  }
  return out;
}

// Roughly triple the median callout on the site, which sits around 45 words.
// A callout at this length is a section that has not been given its heading
// yet; the limit is a smell test, not a hard style rule.
const MAX_WORDS = 120;

test('no callout has grown into a section', () => {
  const oversized: string[] = [];

  for (const file of mdxFiles(docsRoot)) {
    const rel = file.slice(docsRoot.length);
    for (const { title, words } of calloutBodies(readFileSync(file, 'utf8'))) {
      if (words > MAX_WORDS) {
        oversized.push(`${rel}: "${title}" is ${words} words`);
      }
    }
  }

  assert.deepEqual(
    oversized,
    [],
    `Callouts over ${MAX_WORDS} words should become a section with a heading ` +
      `instead:\n  ${oversized.join('\n  ')}`,
  );
});

test('the callout scan actually finds callouts', () => {
  // Guards the regex above: a markup change that stopped matching would make
  // the limit silently vacuous rather than failing.
  const total = mdxFiles(docsRoot).reduce(
    (n, file) => n + calloutBodies(readFileSync(file, 'utf8')).length,
    0,
  );
  assert.ok(total > 20, `expected the docs to contain callouts, found ${total}`);
});
