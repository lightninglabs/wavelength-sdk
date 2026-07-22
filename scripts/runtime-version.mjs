// Prints RUNTIME_MANIFEST_VERSION, the pinned daemon version from
// packages/core/src/version.ts, for build tooling that cannot import
// TypeScript: the demo's fetch-runtime-assets.sh and wasm-local.sh, the
// deploy-pages workflow, and ci.yml's runtime-pin job. Plain JS on purpose so
// it runs on any Node without type stripping. The value is parsed from the
// source text, so the const must stay a single-quoted string literal; its
// TSDoc says so.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const versionFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'core',
  'src',
  'version.ts',
);

// Reads RUNTIME_MANIFEST_VERSION out of the core source, throwing an
// actionable error when the assignment no longer matches the expected
// single-quoted literal form.
export function runtimeVersion() {
  const source = readFileSync(versionFile, 'utf8');
  const match = source.match(/RUNTIME_MANIFEST_VERSION = '([^']+)'/);
  if (!match) {
    throw new Error(
      `could not parse RUNTIME_MANIFEST_VERSION from ${versionFile}; ` +
        "expected an assignment of the form RUNTIME_MANIFEST_VERSION = '<version>'.",
    );
  }
  return match[1];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.write(runtimeVersion());
}
