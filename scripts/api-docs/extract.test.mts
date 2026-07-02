import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kebab, parseRestRules, extractApiDoc } from './extract.mts';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const proto = fixture('sample.proto');
const yaml = fixture('sample.yaml');

test('kebab converts PascalCase RPC names', () => {
  assert.equal(kebab('PrepareSend'), 'prepare-send');
  assert.equal(kebab('GetExitPlan'), 'get-exit-plan');
  assert.equal(kebab('Create'), 'create');
});

test('parseRestRules reads gateway POST rules', () => {
  const rules = parseRestRules(yaml);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], {
    selector: 'fixturepkg.FixtureService.Ping',
    method: 'POST',
    path: '/v1/fixture/ping',
  });
});

test('extractApiDoc extracts methods with comments, routes, and streaming', () => {
  const doc = extractApiDoc(proto, yaml, 'fixtures/sample.proto');
  assert.equal(doc.package, 'fixturepkg');
  assert.equal(doc.methods.length, 2);

  const ping = doc.methods.find((m) => m.name === 'Ping')!;
  assert.equal(ping.slug, 'ping');
  assert.equal(ping.service, 'FixtureService');
  assert.equal(ping.comment, 'Ping checks liveness.');
  assert.equal(ping.rest.path, '/v1/fixture/ping');
  assert.equal(ping.responseStream, false);
  assert.deepEqual(ping.referencedTypes, ['Mode', 'Detail']);

  const watch = doc.methods.find((m) => m.name === 'WatchThings')!;
  assert.equal(watch.slug, 'watch-things');
  assert.equal(watch.responseStream, true);
});

test('extractApiDoc extracts fields, oneofs, repeated, and enums', () => {
  const doc = extractApiDoc(proto, yaml, 'fixtures/sample.proto');
  const watchReq = doc.messages['WatchRequest'];
  const id = watchReq.fields.find((f) => f.name === 'id')!;
  assert.equal(id.oneof, 'target');
  assert.equal(id.comment, 'id watches one entry.');

  const tags = doc.messages['Detail'].fields.find((f) => f.name === 'tags')!;
  assert.equal(tags.repeated, true);
  assert.equal(tags.type, 'string');

  const mode = doc.enums['Mode'];
  assert.equal(mode.comment, 'Mode selects echo behavior.');
  assert.equal(mode.values[1].name, 'MODE_LOUD');
  assert.equal(mode.values[1].comment, 'MODE_LOUD echoes uppercased.');
});

test('extractApiDoc fails loudly on a missing gateway route', () => {
  const partialYaml = yaml
    .split('\n')
    .filter((l) => !l.includes('WatchThings') && !l.includes('/v1/fixture/watch'))
    .join('\n')
    // Drop the dangling "- selector:"-less body line left by the filter.
    .replace(/\n\s+body: "\*"\s*$/, '\n');
  assert.throws(
    () => extractApiDoc(proto, partialYaml, 'fixtures/sample.proto'),
    /WatchThings has no gateway route/,
  );
});

test('extractApiDoc fails loudly on a missing doc comment', () => {
  const uncommented = proto.replace('    // text is echoed back.\n', '');
  assert.throws(
    () => extractApiDoc(uncommented, yaml, 'fixtures/sample.proto'),
    /PingRequest\.text has no doc comment/,
  );
});

test('extractApiDoc marks proto3 optional fields as optional, not a oneof', () => {
  // protobufjs models proto3 `optional` as membership in a synthetic oneof
  // named `_<field>`; extractApiDoc must resolve that to optional: true and
  // oneof: null, distinguishing it from a real, user-declared oneof.
  const doc = extractApiDoc(proto, yaml, 'fixtures/sample.proto');
  const shout = doc.messages['PingRequest'].fields.find((f) => f.name === 'shout')!;
  assert.equal(shout.optional, true);
  assert.equal(shout.oneof, null);
});

test('extractApiDoc sanitizes em-dashes out of comments', () => {
  // Build the em-dash from an escape so this test file itself contains no
  // literal U+2014 character, matching the repo-wide ban.
  const emDash = '\u2014';
  const withEmDash = proto.replace(
    '// Ping checks liveness.',
    `// Ping checks liveness ${emDash} it never fails.`,
  );
  const doc = extractApiDoc(withEmDash, yaml, 'fixtures/sample.proto');
  const ping = doc.methods.find((m) => m.name === 'Ping')!;
  assert.match(ping.comment, / - /);
  assert.doesNotMatch(ping.comment, /\u2014/);
});
