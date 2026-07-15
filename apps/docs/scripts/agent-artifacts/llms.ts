// Generates /llms.txt (a curated, spec-shaped index of markdown mirrors) and
// /llms-full.txt (the full corpus in one file). Both derive from the nav
// config plus the generated mirrors, so they cannot drift from the site.
import { SLICES, flattenNav, type NavGroup } from '../../src/config/nav.ts';
import { SITE_URL } from '../../src/config/site.ts';
import type { PageRecord } from './index.ts';

/** One H2 section of the llms indexes. */
export interface LlmsSection {
  label: string;
  nav: NavGroup[];
}

// One llms section per slice, in slice order.
export const SECTIONS: LlmsSection[] = SLICES.map((s) => ({ label: s.label, nav: s.nav }));

const PREAMBLE = `# WalletDK

> Embed a self-custodial Lightning wallet in your app: send and receive
> Lightning payments with no node to run, no channels to open, and no inbound
> liquidity to manage.

Notes for agents:

- Every docs page has a markdown twin at the same URL with .md appended.
  Fetch the .md URLs below instead of the HTML.
- Check the npm registry for current @lightninglabs/wavelength-* versions
  instead of relying on memorized ones.
- For integration work, install the WalletDK skills:
  npx skills add lightninglabs/dawallet (goes live at launch)
  npx skills add ${new URL(SITE_URL).host}
- The full corpus in one file: ${SITE_URL}/llms-full.txt
`;

function navPages(pages: PageRecord[]): { label: string; entries: PageRecord[] }[] {
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  return SECTIONS.map((section) => ({
    label: section.label,
    entries: flattenNav(section.nav).map((item) => {
      const route = `/${item.slug}/`;
      const page = byRoute.get(route);
      if (!page) throw new Error(`llms.txt: nav entry ${route} has no markdown mirror.`);
      if (!page.description) throw new Error(`llms.txt: page ${route} is missing a description.`);
      return page;
    }),
  }));
}

function mdUrl(route: string): string {
  return `${SITE_URL}${route.replace(/\/$/, '')}.md`;
}

export function buildLlmsTxt(pages: PageRecord[]): string {
  const sections = navPages(pages).map(({ label, entries }) => {
    const lines = entries.map((p) => `- [${p.title}](${mdUrl(p.route)}): ${p.description}`);
    return `## ${label}\n\n${lines.join('\n')}`;
  });
  return `${PREAMBLE}\n${sections.join('\n\n')}\n`;
}

export function buildLlmsFullTxt(pages: PageRecord[]): string {
  // Each page's markdown already starts with its own h1, so a section is
  // just a source pointer plus the body.
  const docs = navPages(pages)
    .flatMap(({ entries }) => entries)
    .map((p) => `Source: ${mdUrl(p.route)}\n\n${p.markdown}`);
  return `${docs.join('\n---\n\n')}`;
}
