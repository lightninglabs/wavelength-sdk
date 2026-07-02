// Reads and validates the repo-root skills for catalog generation and tests.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface SkillEntry {
  name: string;
  description: string;
  dir: string;
  files: string[];
}

function listFiles(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((f) => {
    const abs = join(dir, f);
    const rel = base ? `${base}/${f}` : f;
    return statSync(abs).isDirectory() ? listFiles(abs, rel) : [rel];
  });
}

export function readSkills(repoRoot: string): SkillEntry[] {
  const skillsDir = join(repoRoot, 'skills');
  return readdirSync(skillsDir)
    .filter((d) => statSync(join(skillsDir, d)).isDirectory())
    .map((d) => {
      const raw = readFileSync(join(skillsDir, d, 'SKILL.md'), 'utf8');
      const match = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!match) throw new Error(`skills/${d}/SKILL.md has no frontmatter.`);
      const fm = parse(match[1]) as { name?: string; description?: string };
      if (!fm.name || !fm.description) {
        throw new Error(`skills/${d}/SKILL.md frontmatter needs name and description.`);
      }
      if (!/^[a-z0-9-]{1,64}$/.test(fm.name)) {
        throw new Error(`skills/${d}/SKILL.md name "${fm.name}" must match ^[a-z0-9-]{1,64}$.`);
      }
      if (fm.name !== d) {
        throw new Error(`skills/${d}/SKILL.md name "${fm.name}" must match its directory name.`);
      }
      if (fm.description.length > 1024) {
        throw new Error(`skills/${d}/SKILL.md description exceeds 1024 characters.`);
      }
      return {
        name: fm.name,
        description: fm.description,
        dir: `skills/${d}`,
        files: listFiles(join(skillsDir, d)),
      };
    });
}

export function buildCatalog(skills: SkillEntry[]): string {
  return `${JSON.stringify(
    { skills: skills.map(({ name, description, files }) => ({ name, description, files })) },
    null,
    2,
  )}\n`;
}
