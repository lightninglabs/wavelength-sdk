// Route and file mapping for the generated markdown mirrors. Every docs page
// gets a sibling mirror at both <route>.md and <route>/index.md because both
// conventions exist in the wild and emitting both costs nothing.

const EXCLUDED_PREFIXES = ['pagefind/', 'runtime/', 'demo/', '_astro/'];

export function pageRoute(relHtmlPath: string): string | null {
  if (!relHtmlPath.endsWith('index.html')) return null;
  if (EXCLUDED_PREFIXES.some((p) => relHtmlPath.startsWith(p))) return null;
  if (relHtmlPath === 'index.html') return '/';
  return `/${relHtmlPath.slice(0, -'index.html'.length)}`;
}

export function mirrorFilesFor(route: string): string[] {
  if (route === '/') return ['index.md'];
  const bare = route.replace(/^\//, '').replace(/\/$/, '');
  return [`${bare}.md`, `${bare}/index.md`];
}
