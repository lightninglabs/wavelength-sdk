import { cpSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { runtimeVersion } from '../../../scripts/runtime-version.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repository = resolve(root, '../../..');
const assets = process.env.WAVELENGTH_EXTENSION_RUNTIME_DIR ||
  resolve(root, '../public/runtime', runtimeVersion());
const output = resolve(root, 'dist');

// Package only the pinned release bytes. No runtime code is fetched remotely
// by the extension, and no generated binaries are committed to the repository.
execFileSync(process.execPath, [
  resolve(repository, 'scripts/runtime-digests.mjs'), 'check', assets,
], { stdio: 'inherit' });
await build({
  configFile: false,
  root,
  base: './',
  build: {
    outDir: output,
    emptyOutDir: true,
    rollupOptions: { input: [resolve(root, 'popup.html'), resolve(root, 'owner.html')] },
  },
});
mkdirSync(resolve(output, 'runtime'), { recursive: true });
cpSync(assets, resolve(output, 'runtime'), { recursive: true });
