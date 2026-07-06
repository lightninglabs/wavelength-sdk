import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRoute, mirrorFilesFor } from './paths.ts';

test('maps built html files to site routes', () => {
  assert.equal(pageRoute('index.html'), '/');
  assert.equal(pageRoute('guides/use-a-passkey/index.html'), '/guides/use-a-passkey/');
});

test('excludes non-page assets', () => {
  assert.equal(pageRoute('404.html'), null);
  assert.equal(pageRoute('pagefind/index.html'), null);
  assert.equal(pageRoute('runtime/index.html'), null);
  assert.equal(pageRoute('demo/index.html'), null);
});

test('emits both md conventions for a nested route', () => {
  assert.deepEqual(mirrorFilesFor('/guides/use-a-passkey/'), [
    'guides/use-a-passkey.md',
    'guides/use-a-passkey/index.md',
  ]);
});

test('the root route gets a single index mirror', () => {
  assert.deepEqual(mirrorFilesFor('/'), ['index.md']);
});
