// gen-api-docs.mts regenerates apps/docs/src/data/api/wallet.json from the
// wavelength daemon's wavewalletrpc proto and gateway config. This is a
// maintainer command mirroring gen-types.mts: the output is committed, so
// docs builds never need the Go checkout. Re-run when the daemon's wallet
// API changes.
//
// SYSTEM REQUIREMENTS:
//   - Node >= 24 (this is a .mts run with native type stripping)
//   - wavelength: a sibling checkout at ../wavelength, or set WAVELENGTH_DIR

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractApiDoc } from './api-docs/extract.mts';
import { apiDocSchema } from '../apps/docs/src/data/api/schema.ts';
import { API_NAV, flattenNav } from '../apps/docs/src/config/nav.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const wavelength = process.env.WAVELENGTH_DIR
  ? resolve(process.env.WAVELENGTH_DIR)
  : resolve(root, '../wavelength');

if (!existsSync(wavelength)) {
  console.error(
    `wavelength checkout not found at ${wavelength}. Clone it as a sibling or set WAVELENGTH_DIR.`,
  );
  process.exit(1);
}

const protoRel = 'rpc/wavewalletrpc/wallet.proto';
const yamlRel = 'rpc/wavewalletrpc/wallet.yaml';
const outFile = resolve(root, 'apps/docs/src/data/api/wallet.json');

const doc = apiDocSchema.parse(
  extractApiDoc(
    readFileSync(resolve(wavelength, protoRel), 'utf8'),
    readFileSync(resolve(wavelength, yamlRel), 'utf8'),
    protoRel,
  ),
);

// The sidebar is curated by hand in API_NAV; fail when it drifts from the
// proto so a daemon change cannot silently ship a missing or phantom page.
const navSlugs = flattenNav(API_NAV)
  .filter((i) => i.slug.startsWith('api/wallet/'))
  .map((i) => i.slug.slice('api/wallet/'.length))
  .sort();
const methodSlugs = doc.methods.map((m) => m.slug).sort();
if (JSON.stringify(navSlugs) !== JSON.stringify(methodSlugs)) {
  console.error('API_NAV and wallet.proto methods have drifted.');
  console.error(`  nav:   ${navSlugs.join(', ')}`);
  console.error(`  proto: ${methodSlugs.join(', ')}`);
  process.exit(1);
}

writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`Wrote ${doc.methods.length} methods to ${outFile}`);
