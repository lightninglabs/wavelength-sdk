import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRoute, mirrorFilesFor } from './paths.ts';

test('maps built html files to site routes', () => {
  assert.equal(pageRoute('index.html'), '/');
  assert.equal(pageRoute('web/guides/use-a-passkey/index.html'), '/web/guides/use-a-passkey/');
});

test('excludes non-page assets', () => {
  assert.equal(pageRoute('404.html'), null);
  assert.equal(pageRoute('pagefind/index.html'), null);
  assert.equal(pageRoute('runtime/index.html'), null);
  assert.equal(pageRoute('demo/index.html'), null);
});

test('emits both md conventions for a nested route', () => {
  assert.deepEqual(mirrorFilesFor('/web/guides/use-a-passkey/'), [
    'web/guides/use-a-passkey.md',
    'web/guides/use-a-passkey/index.md',
  ]);
});

test('the root route gets a single index mirror', () => {
  assert.deepEqual(mirrorFilesFor('/'), ['index.md']);
});
