// Pure data checks: no browser. Uses readFileSync instead of a JSON import so
// it runs under Playwright's transform without loader configuration.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiDocSchema } from '../src/data/api/schema.ts';
import { API_CLI, API_CLI_INVOCATION, API_SAMPLES } from '../src/config/api.ts';
import {
  cliSample, curlSample, jsRestSample, goGrpcSample, pythonGrpcSample, jsGrpcSample,
  shellQuote,
} from '../src/data/api/samples.ts';
import { flattenNav, CLI_NAV } from '../src/config/nav.ts';

const doc = apiDocSchema.parse(
  JSON.parse(readFileSync(new URL('../src/data/api/wallet.json', import.meta.url), 'utf8')),
);

test('wallet.json validates and holds all sixteen methods', () => {
  expect(doc.methods).toHaveLength(16);
  expect(doc.services.map((s) => s.name)).toEqual([
    'WalletService',
    'WalletInspectionService',
  ]);
});

test('every method has a curated CLI mapping and sample body', () => {
  for (const m of doc.methods) {
    expect(API_CLI, m.name).toHaveProperty(m.name);
    expect(API_SAMPLES, m.name).toHaveProperty(m.name);
  }
});

test('schema rejects a method whose requestType does not resolve in messages or enums', () => {
  const broken = JSON.parse(JSON.stringify(doc));
  broken.methods[0].requestType = 'NoSuchMessage';
  expect(() => apiDocSchema.parse(broken)).toThrow();
});

test('schema rejects a referencedTypes entry that does not resolve in messages or enums', () => {
  const broken = JSON.parse(JSON.stringify(doc));
  broken.methods[0].referencedTypes.push('NoSuchType');
  expect(() => apiDocSchema.parse(broken)).toThrow();
});

test('schema rejects a messages map key that does not match its value name', () => {
  const broken = JSON.parse(JSON.stringify(doc));
  const [firstKey, firstMessage] = Object.entries(broken.messages)[0];
  delete broken.messages[firstKey];
  broken.messages['WrongKey'] = firstMessage;
  expect(() => apiDocSchema.parse(broken)).toThrow();
});

test('CLI mappings point at real CLI pages', () => {
  const cliSlugs = new Set(flattenNav(CLI_NAV).map((i) => i.slug));
  for (const [method, cmd] of Object.entries(API_CLI)) {
    if (cmd !== null) {
      expect(cliSlugs.has(`cli/${cmd}`), `${method} -> ${cmd}`).toBe(true);
    }
  }
});

test('sample fields exist on the request message', () => {
  for (const m of doc.methods) {
    const req = doc.messages[m.requestType];
    const fieldNames = new Set(req.fields.map((f) => f.name));
    for (const key of Object.keys(API_SAMPLES[m.name] ?? {})) {
      expect(fieldNames.has(key), `${m.name} sample field ${key}`).toBe(true);
    }
  }
});

test('generators produce plausible snippets for every method', () => {
  for (const m of doc.methods) {
    expect(curlSample(m)).toContain(m.rest.path);
    expect(jsRestSample(m)).toContain(m.rest.path);
    expect(goGrpcSample(m)).toContain(m.name);
    expect(pythonGrpcSample(m)).toContain(m.name);
    expect(jsGrpcSample(m)).toContain(m.name);
    const cli = cliSample(m);
    if (API_CLI[m.name] === null) {
      expect(cli).toBeNull();
    } else {
      expect(cli).toContain('darepocli');
    }
  }
});

test('every method has a curated CLI invocation, null exactly where API_CLI is null', () => {
  for (const m of doc.methods) {
    expect(API_CLI_INVOCATION, m.name).toHaveProperty(m.name);
    const invocation = API_CLI_INVOCATION[m.name];
    if (API_CLI[m.name] === null) {
      expect(invocation, m.name).toBeNull();
    } else {
      expect(invocation, m.name).not.toBeNull();
      expect(invocation, m.name).toMatch(/^darepocli /);
    }
  }
});

test('curated CLI invocations use the correct subcommands for the four corrected pages', () => {
  expect(API_CLI_INVOCATION.ExitStatus).toContain('status');
  expect(API_CLI_INVOCATION.GetExitPlan).toContain('plan');
  expect(API_CLI_INVOCATION.Deposit).toContain('--onchain');
  expect(API_CLI_INVOCATION.InspectActivity).toContain('inspect');
});

test('shellQuote escapes embedded single quotes so the curl sample stays valid', () => {
  expect(shellQuote('plain')).toBe(`'plain'`);
  // Close the quote, emit an escaped literal quote, reopen the quote: the
  // standard POSIX technique for a single quote inside a single-quoted word.
  expect(shellQuote(`Bob's wallet`)).toBe(`'Bob'\\''s wallet'`);
});

test('goGrpcSample and pythonGrpcSample inline curated sample values, not a placeholder', () => {
  for (const m of doc.methods) {
    const go = goGrpcSample(m);
    const python = pythonGrpcSample(m);
    expect(go).not.toContain('Populate request fields');
    expect(python).not.toContain('Populate request fields');
    for (const key of Object.keys(API_SAMPLES[m.name] ?? {})) {
      // Go field names are PascalCase; Python kwargs keep the snake_case key.
      expect(python, `${m.name} python kwarg ${key}`).toContain(`${key}=`);
    }
  }
});

test('goGrpcSample and pythonGrpcSample render enum sample values as identifiers, not strings', () => {
  const list = doc.methods.find((m) => m.name === 'List')!;
  const go = goGrpcSample(list);
  const python = pythonGrpcSample(list);
  expect(go).toContain('wavewalletrpc.ListView_LIST_VIEW_ACTIVITY');
  expect(go).not.toContain('"LIST_VIEW_ACTIVITY"');
  expect(python).toContain('wallet_pb2.LIST_VIEW_ACTIVITY');
  expect(python).not.toContain('"LIST_VIEW_ACTIVITY"');
});
