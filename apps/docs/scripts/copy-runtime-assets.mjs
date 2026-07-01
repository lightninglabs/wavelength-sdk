// Stage the wasm runtime binaries into public/runtime/ for self-hosted local
// dev (the fallback until the RFC's CDN hosting lands). Source order:
//   1. DAREPO_DIR/bin/wasm (a darepo-client checkout), if set;
//   2. the demo's already-staged apps/web-wallet-demo/public/.
// Mirrors RUNTIME_ASSET_FILES in packages/web/src/runtime-manifest.ts.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = [
  'walletdk.wasm',
  'walletdk.wasm.gz',
  'wasm_exec.js',
  'sqlite-bridge.js',
  'sqlite-worker.js',
  'sqlite3.js',
  'sqlite3.wasm',
  'sqlite3-opfs-async-proxy.js',
];

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, '..', 'public', 'runtime');
const darepo = process.env.DAREPO_DIR
  ? join(process.env.DAREPO_DIR, 'bin', 'wasm')
  : null;
const demo = join(here, '..', '..', 'web-wallet-demo', 'public');
const source = darepo && existsSync(darepo) ? darepo : demo;

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const name of ASSETS) {
  const from = join(source, name);
  if (existsSync(from)) {
    cpSync(from, join(dest, name));
    copied += 1;
  }
}

if (copied === 0) {
  console.error(
    `[copy-runtime-assets] no assets found in ${source}. ` +
      'Build them with `pnpm --filter web-wallet-demo run wasm:local` ' +
      '(needs a darepo-client checkout + Go), or set DAREPO_DIR.',
  );
  process.exit(1);
}

if (copied < ASSETS.length) {
  console.error(
    `[copy-runtime-assets] staged only ${copied}/${ASSETS.length} assets from ${source}. ` +
      'A partial runtime set will break the live wallet; rebuild wasm assets or set DAREPO_DIR.',
  );
  process.exit(1);
}

console.log(`[copy-runtime-assets] staged ${copied}/${ASSETS.length} into ${dest}`);
