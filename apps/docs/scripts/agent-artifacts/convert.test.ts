import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPageHtml } from './convert.ts';

const page = (body: string, head = '') => `<!doctype html><html><head>
  <title>Use a passkey | Wavelength</title>
  <meta name="description" content="Protect the wallet with a passkey.">
  ${head}</head><body><main data-pagefind-body>${body}</main></body></html>`;

test('extracts title, description, and prose', () => {
  const out = convertPageHtml(page('<h1>Use a passkey</h1><p>Hello <strong>world</strong>.</p>'));
  assert.ok(out);
  assert.equal(out.title, 'Use a passkey');
  assert.equal(out.description, 'Protect the wallet with a passkey.');
  assert.match(out.markdown, /# Use a passkey/);
  assert.match(out.markdown, /Hello \*\*world\*\*\./);
});

test('returns null when there is no pagefind body', () => {
  assert.equal(convertPageHtml('<html><body><p>404</p></body></html>'), null);
});

test('lifts expressive-code frames into fenced code blocks', () => {
  // The real expressive-code copy button separates lines with U+007F (DEL),
  // not a literal newline; its own copy-to-clipboard script performs the
  // same replacement client-side before writing to the clipboard.
  const ec = `<div class="expressive-code"><figure class="frame has-title">
    <figcaption class="header"><span class="title">App.tsx</span></figcaption>
    <pre data-language="tsx"><code><div class="ec-line">const a = 1;</div><div class="ec-line">const b = 2;</div></code></pre>
    <div class="copy"><button title="Copy to clipboard" data-code="const a = 1;const b = 2;"></button></div>
  </figure></div>`;
  const out = convertPageHtml(page(ec));
  assert.ok(out);
  // The installed rehype-remark version does not surface data-meta as fence
  // meta, so the title is dropped from the fence; the code content is what
  // matters.
  assert.match(out.markdown, /```tsx\nconst a = 1;\nconst b = 2;\n```/);
});

test('falls back to line text when the copy button is absent', () => {
  const ec = `<div class="expressive-code"><figure class="frame">
    <pre data-language="sh"><code><div class="ec-line">pnpm build</div></code></pre>
  </figure></div>`;
  const out = convertPageHtml(page(ec));
  assert.ok(out);
  assert.match(out.markdown, /```sh\npnpm build\n```/);
});

test('preserves mermaid sources as mermaid fences', () => {
  // The &gt; entity in the fixture decodes to > during parsing.
  const out = convertPageHtml(page('<pre class="mermaid">graph TD; A--&gt;B;</pre>'));
  assert.ok(out);
  assert.match(out.markdown, /```mermaid\ngraph TD; A-->B;\n```/);
});

test('converts callouts to labeled blockquotes', () => {
  const callout = `<aside class="wdk-callout wdk-callout--tip">
    <p class="wdk-callout__title">Tip</p>
    <div class="wdk-callout__body"><p>Use OPFS.</p></div>
  </aside>`;
  const out = convertPageHtml(page(callout));
  assert.ok(out);
  assert.match(out.markdown, /> \*\*Tip\*\*/);
  assert.match(out.markdown, /> Use OPFS\./);
});

test('replaces client islands with a placeholder note', () => {
  const out = convertPageHtml(page('<astro-island uid="x"><div>demo</div></astro-island>'));
  assert.ok(out);
  assert.match(out.markdown, /Interactive example omitted/);
  assert.doesNotMatch(out.markdown, /uid/);
});

test('strips HTML comments from real layout markup', () => {
  // Astro does not strip layout section-marker comments from the built
  // HTML; they must not leak into the markdown output.
  const html = '<!-- Page header --><h1>Use a passkey</h1><!-- end header -->';
  const out = convertPageHtml(page(html));
  assert.ok(out);
  assert.doesNotMatch(out.markdown, /Page header/);
  assert.doesNotMatch(out.markdown, /<!--/);
});

test('converts a heading with a hard break to a single ATX line', () => {
  // A <br/> inside a heading otherwise forces remark-stringify to emit a
  // Setext heading (text\n===) instead of an ATX heading (# text), since
  // Setext is the only form that can carry a hard line break.
  const html = '<h1>Ship a self-custodial<br/>wallet <em>in an afternoon.</em></h1>';
  const out = convertPageHtml(page(html));
  assert.ok(out);
  assert.match(out.markdown, /^# Ship a self-custodial wallet \*in an afternoon\.\*$/m);
  assert.doesNotMatch(out.markdown, /^=+$/m);
});

test('drops pagefind-ignored elements and converts tables', () => {
  const html = `
    <table><thead><tr><th>Name</th><th>Type</th></tr></thead>
    <tbody><tr><td>network</td><td>string</td></tr></tbody></table>
    <nav data-pagefind-ignore><a href="/x/">Next</a></nav>`;
  const out = convertPageHtml(page(html));
  assert.ok(out);
  // remark-stringify pads table cells to align columns; the exact spacing is
  // not a contract, only the header cell values are.
  assert.match(out.markdown, /\| Name {4}\| Type {3}\|/);
  assert.doesNotMatch(out.markdown, /Next/);
});
