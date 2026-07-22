// A code block renders about 94 monospace characters at the content column's
// width, so a longer line scrolls sideways inside its frame. In a static
// reading pass that reads as truncation: the sample simply stops mid-token,
// and the part that falls off is often the trailing comment carrying the
// advice.
//
// Twenty authored lines had drifted past that before this test existed, most
// of them multi-specifier imports that a formatter would have broken across
// lines anyway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = fileURLToPath(new URL('./docs/', import.meta.url));

/** Measured capacity is ~94 characters; leave a little headroom. */
const MAX_CHARS = 84;

/**
 * Lines that cannot be broken and are correct as they stand.
 *
 * The JSON fields hold fixed-width hex: a compressed public key is 66
 * characters, a hash 64, an outpoint a txid plus an index. Shortening one to
 * fit would make the sample wrong, and JSON has no line-continuation syntax.
 *
 * The prompt blocks on the agents page are meant to be copied verbatim into a
 * coding agent, so a URL broken across lines would be pasted broken.
 */
const ALLOWED = [
  /"(identity_pubkey|payment_hash|outpoint|txid)":/,
  /https:\/\/wavelength\.lightning\.engineering\//,
];

function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return mdxFiles(full);
    return full.endsWith('.mdx') ? [full] : [];
  });
}

/**
 * Line numbers of over-long lines inside code, meaning both fenced blocks and
 * the `export const xSig = ` template literals that hold signature samples on
 * the reference pages. Prose is exempt: it wraps.
 */
function longCodeLines(source: string): { line: number; len: number; text: string }[] {
  const out: { line: number; len: number; text: string }[] = [];
  let inFence = false;
  let inTemplate = false;

  source.split('\n').forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (!inFence) {
      // A signature literal opens with `= \`` and closes on the line whose
      // backtick count returns the balance to even.
      if (/=\s*`/.test(line) && (line.match(/`/g) ?? []).length % 2 === 1) {
        inTemplate = true;
        return;
      }
      if (inTemplate && line.includes('`')) {
        inTemplate = false;
        return;
      }
    }

    if (!inFence && !inTemplate) return;
    if (line.length <= MAX_CHARS) return;
    if (ALLOWED.some((re) => re.test(line))) return;
    out.push({ line: i + 1, len: line.length, text: trimmed.slice(0, 60) });
  });

  return out;
}

test('code samples fit their block without scrolling', () => {
  const tooLong: string[] = [];

  for (const file of mdxFiles(docsRoot)) {
    const rel = file.slice(docsRoot.length);
    for (const { line, len, text } of longCodeLines(readFileSync(file, 'utf8'))) {
      tooLong.push(`${rel}:${line} is ${len} chars: ${text}`);
    }
  }

  assert.deepEqual(
    tooLong,
    [],
    `Code lines over ${MAX_CHARS} chars scroll sideways in the rendered block. ` +
      `Break them (a multi-line import, a comment on its own line) or, if the ` +
      `line genuinely cannot be broken, add it to ALLOWED with a reason:\n  ` +
      `${tooLong.join('\n  ')}`,
  );
});
