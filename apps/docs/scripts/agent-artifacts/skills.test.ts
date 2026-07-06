import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkills, buildCatalog } from './skills.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('all four skills parse with spec-conformant frontmatter', () => {
  const skills = readSkills(repoRoot);
  assert.deepEqual(
    skills.map((s) => s.name).sort(),
    ['walletdk-api', 'walletdk-cli', 'walletdk-react-native', 'walletdk-web'],
  );
  for (const s of skills) {
    assert.match(s.name, /^[a-z0-9-]{1,64}$/, `${s.name}: name charset and length`);
    assert.equal(s.name, s.dir.split('/').pop(), `${s.name}: name matches directory`);
    assert.ok(s.description.length > 0 && s.description.length <= 1024, `${s.name}: description length`);
    assert.ok(s.files.includes('SKILL.md'), `${s.name}: files include SKILL.md`);
  }
});

test('skill bodies stay inside the spec size guidance', () => {
  for (const s of readSkills(repoRoot)) {
    const body = readFileSync(join(repoRoot, s.dir, 'SKILL.md'), 'utf8');
    assert.ok(body.split('\n').length < 500, `${s.name}: under 500 lines`);
    assert.ok(!body.includes('\u2014'), `${s.name}: no em-dashes`);
  }
});

test('catalog JSON matches the well-known shape', () => {
  const catalog = JSON.parse(buildCatalog(readSkills(repoRoot)));
  assert.ok(Array.isArray(catalog.skills));
  assert.equal(catalog.skills.length, 4);
  for (const s of catalog.skills) {
    assert.equal(typeof s.name, 'string');
    assert.equal(typeof s.description, 'string');
    assert.ok(Array.isArray(s.files) && s.files.includes('SKILL.md'));
  }
});

test('marketplace manifest parses and points at the plugin root', () => {
  const raw = readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8');
  const manifest = JSON.parse(raw);
  assert.equal(manifest.name, 'walletdk');
  assert.ok(Array.isArray(manifest.plugins) && manifest.plugins.length === 1);
  assert.equal(manifest.plugins[0].source, './');
});
