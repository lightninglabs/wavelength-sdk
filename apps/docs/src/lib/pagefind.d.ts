/**
 * Minimal type surface for the Pagefind runtime served at /pagefind/pagefind.js.
 * The runtime is generated at build time and does not ship its own types, so we
 * describe just the parts SearchModal uses. See https://pagefind.app/docs/api/.
 */

/** A single sub-result (an anchor section within a page). */
export interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
}

/** The resolved data for one search hit. */
export interface PagefindResultData {
  url: string;
  /** The page <title>, used as the result heading. */
  meta: { title?: string } & Record<string, string>;
  excerpt: string;
  sub_results?: PagefindSubResult[];
}

/** A search hit; `data()` lazily fetches the fragment for this hit. */
export interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}

export interface PagefindSearchResponse {
  results: PagefindResult[];
}

export interface Pagefind {
  options?: (opts: Record<string, unknown>) => Promise<void>;
  init?: () => Promise<void>;
  search: (term: string) => Promise<PagefindSearchResponse>;
}
