// Post-build entry point: converts every built page to a markdown mirror and
// assembles the llms indexes and the skills catalog. Runs via the docs app's
// postbuild hook, so `pnpm build` always produces current artifacts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { glob } from 'node:fs/promises';
import { convertPageHtml } from './convert.ts';
import { pageRoute, mirrorFilesFor } from './paths.ts';
import { buildLlmsTxt, buildLlmsFullTxt } from './llms.ts';
import { SITE_URL } from '../../src/config/site.ts';

export interface PageRecord {
  route: string;
  title: string;
  description: string | null;
  markdown: string;
}

function frontmatter(page: PageRecord): string {
  const esc = (s: string) => JSON.stringify(s);
  const lines = [
    '---',
    `title: ${esc(page.title)}`,
    ...(page.description ? [`description: ${esc(page.description)}`] : []),
    `canonical: ${SITE_URL}${page.route}`,
    '---',
    '',
    `> Docs index: ${SITE_URL}/llms.txt`,
    '',
  ];
  return lines.join('\n');
}

export async function buildMirrors(distDir: string): Promise<PageRecord[]> {
  const pages: PageRecord[] = [];
  for await (const entry of glob('**/index.html', { cwd: distDir })) {
    const route = pageRoute(entry);
    if (!route) continue;
    const html = readFileSync(join(distDir, entry), 'utf8');
    const converted = convertPageHtml(html);
    if (!converted) {
      console.warn(`agent-artifacts: ${route} has no [data-pagefind-body]; skipping its mirror.`);
      continue;
    }
    const page: PageRecord = { route, ...converted };
    pages.push(page);
    // The layouts render the h1 inside the pagefind body, but some layouts
    // put a breadcrumb nav before it, so it is not always the first line.
    // Fall back to a synthesized one only if the markdown has no ATX h1 at all.
    const markdown = /^# /m.test(page.markdown)
      ? page.markdown
      : `# ${page.title}\n\n${page.markdown}`;
    const body = `${frontmatter(page)}\n${markdown}`;
    for (const rel of mirrorFilesFor(route)) {
      const out = join(distDir, rel);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, body);
    }
  }
  return pages;
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = join(here, '..', '..', 'dist');
  const pages = await buildMirrors(distDir);
  console.log(`agent-artifacts: wrote markdown mirrors for ${pages.length} pages.`);
  writeFileSync(join(distDir, 'llms.txt'), buildLlmsTxt(pages));
  const full = buildLlmsFullTxt(pages);
  writeFileSync(join(distDir, 'llms-full.txt'), full);
  console.log(`agent-artifacts: llms-full.txt is ${(full.length / 1024).toFixed(0)} KB.`);
  if (full.length > 500 * 1024) {
    console.warn('agent-artifacts: llms-full.txt exceeds 500 KB; consider size tiers.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
