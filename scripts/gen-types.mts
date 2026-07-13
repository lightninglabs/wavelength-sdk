// gen-types.mts regenerates packages/core/src/generated.ts from the darepo-client
// walletdk facade types (sdk/walletdk), the source of truth for the daemon's JSON
// wire shapes. It runs tygo (Go struct -> TS) then post-processes the output to
// (1) camelCase field names via the shared camelKey, and (2) rebuild string/int
// literal unions for the enums tygo flattens to bare aliases.
//
// SYSTEM REQUIREMENTS (see docs/codegen.md):
//   - Node >= 24 (the generator is a .mts run with native type stripping)
//   - Go toolchain (matching darepo-client/go.mod)
//   - tygo:           go install github.com/gzuidhof/tygo@latest
//   - darepo-client:  a sibling checkout at ../darepo-client, or set DAREPO_DIR
//
// This is a maintainer command. The generated file is committed, so SDK consumers
// never need Go or tygo -- only re-run `pnpm gen:types` when the facade changes.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { camelKey } from '../packages/core/src/casing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const darepo = process.env.DAREPO_DIR
  ? resolve(process.env.DAREPO_DIR)
  : resolve(root, '../darepo-client');
const goPackage = 'github.com/lightninglabs/darepo-client/sdk/walletdk';
const outFile = resolve(root, 'packages/core/src/generated.ts');

if (!existsSync(darepo)) {
  console.error(
    `darepo-client not found at ${darepo}. Clone it as a sibling or set DAREPO_DIR.`,
  );
  process.exit(1);
}

// Resolve the tygo binary: prefer $GOPATH/bin/tygo, fall back to PATH.
function tygoBin(): string {
  try {
    const gopath = execFileSync('go', ['env', 'GOPATH']).toString().trim();
    const candidate = join(gopath, 'bin', 'tygo');
    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // go not on PATH; fall through and hope tygo is.
  }
  return 'tygo';
}

// 1. Run tygo against the facade package into a temp file. tygo resolves the Go
//    import path via the module, so it must run with cwd inside darepo-client.
const work = mkdtempSync(join(tmpdir(), 'walletdk-tygo-'));
// Best-effort cleanup of the temp dir on any exit (success or failure) so
// repeated or failed runs do not leak directories under the OS temp dir.
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
const wireTs = join(work, 'wire.ts');
const cfg = join(work, 'tygo.yaml');
writeFileSync(
  cfg,
  `packages:\n` +
    `  - path: "${goPackage}"\n` +
    `    output_path: "${wireTs}"\n` +
    // Go time.Time marshals to an RFC3339 string, not an object.
    `    type_mappings:\n` +
    `      time.Time: "string"\n`,
);
execFileSync(tygoBin(), ['generate', '--config', cfg], {
  cwd: darepo,
  stdio: 'inherit',
});

const raw = readFileSync(wireTs, 'utf8');

// 2. camelCase the interface field names only. The pattern matches an indented
//    `Name:` / `Name?:` (interface properties); it never matches `export
//    interface X {` or `export type X = ...` (no leading indent), JSDoc lines
//    (start with `*`), or index signatures (start with `[`). Type names on the
//    right of the colon are left untouched (interface names stay PascalCase).
const camelized = raw.replace(
  /^(\s+)([A-Za-z_]\w*)(\?)?:\s/gm,
  (_, indent, name, optional) => `${indent}${camelKey(name)}${optional ?? ''}: `,
);

// 3. Rebuild enum literal unions. tygo flattens a Go `type X string` enum to a
//    bare `export type X = string;` alias but still emits each value as
//    `export const XValue: X = "...";`. Collect those literals per type and
//    replace the alias with their union, so consumers get real autocomplete.
const enumLiterals = new Map<string, string[]>();
for (const m of camelized.matchAll(/^export const \w+: (\w+) = (.+);$/gm)) {
  const [, type, literal] = m;
  const list = enumLiterals.get(type) ?? [];
  list.push(literal);
  enumLiterals.set(type, list);
}
const withEnums = camelized.replace(
  /^export type (\w+) = (?:string|number)[^;]*;$/gm,
  (line, type) => {
    const literals = enumLiterals.get(type);
    return literals?.length
      ? `export type ${type} = ${literals.join(' | ')};`
      : line;
  },
);

// 4. Drop scalar consts tygo could not resolve. A Go const assigned from
//    another package (e.g. `const MaxSigningWorkers = darepod.MaxSigningWorkers`)
//    is emitted as `export const NAME = any /* pkg.Ref */;`, which is invalid
//    TS (`any` as a value) and not a JSON wire shape anyway. Strip each such
//    declaration together with its leading JSDoc block. Enum value consts are
//    untouched: they carry a `: Type = "literal"` annotation, never `= any`.
const stripped = withEnums.replace(
  /(?:\/\*\*(?:[^*]|\*(?!\/))*\*\/\n)?^export const \w+ = any\b[^\n]*\n/gm,
  '',
);

// 5. Normalize upstream comment text: the facade's Go doc comments may contain
//    em-dash (U+2014) characters, which this repo bans everywhere, generated
//    files included. Map each to an ASCII hyphen at the boundary rather than
//    mutating the upstream source (mirrors scripts/api-docs/extract.mts).
const sanitized = stripped.replace(/\u2014/g, '-');

// 6. Write with a do-not-edit banner.
const banner =
  `// AUTO-GENERATED by scripts/gen-types.mts from ${goPackage}\n` +
  `// (darepo-client). Do not edit by hand; run \`pnpm gen:types\` to refresh.\n\n`;
writeFileSync(outFile, banner + sanitized);
console.log(`wrote ${outFile}`);
