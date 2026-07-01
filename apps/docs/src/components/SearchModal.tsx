import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Pagefind, PagefindResultData } from '../lib/pagefind';

// A flattened, render-ready search hit.
interface Hit {
  url: string;
  title: string;
  excerpt: string;
  /** Top-level path segment, e.g. "concepts" or "web", used to group results. */
  section: string;
}

// Human-readable labels for the leading path segment. Anything unmapped falls
// back to a title-cased version of the segment itself.
const SECTION_LABELS: Record<string, string> = {
  web: 'Web SDK',
  concepts: 'Concepts',
  reference: 'Reference',
  guides: 'Guides',
  docs: 'Overview',
};

function sectionFor(url: string): string {
  // Pagefind URLs look like "/concepts/balances-and-vtxos/"; take the first
  // path segment as the grouping key. Strip any query/hash first so home-page
  // anchor sub-results (e.g. "/#wdk-hero-heading") collapse to the overview
  // group rather than leaking a raw fragment id as the section label.
  const path = url.split(/[?#]/)[0] ?? url;
  const seg = path.replace(/^\/+/, '').split('/')[0] ?? '';
  return seg || 'docs';
}

function labelFor(section: string): string {
  return SECTION_LABELS[section] ?? section.charAt(0).toUpperCase() + section.slice(1);
}

// Turn one Pagefind result fragment into one-or-more flat hits. We surface the
// page itself plus up to a few of its in-page sub-results (anchors) so a query
// can jump straight to the relevant heading.
function hitsFromData(data: PagefindResultData): Hit[] {
  const subs = (data.sub_results ?? []).slice(0, 4);
  if (subs.length > 0) {
    return subs.map((s) => ({
      url: s.url,
      title: s.title || data.meta.title || s.url,
      excerpt: s.excerpt,
      section: sectionFor(s.url),
    }));
  }
  return [
    {
      url: data.url,
      title: data.meta.title || data.url,
      excerpt: data.excerpt,
      section: sectionFor(data.url),
    },
  ];
}

// Thin default export so @astrojs/react's component probe (which calls the
// export directly, outside a render pass) never invokes hooks.
export default function SearchModal() {
  return createElement(SearchModalInner);
}

function SearchModalInner() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagefindUnavailable, setPagefindUnavailable] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Cache the imported Pagefind module so we only load it once.
  const pagefindRef = useRef<Pagefind | null>(null);
  // Token to discard responses from stale (superseded) queries.
  const queryToken = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHits([]);
    setActive(0);
    setSearchError(null);
  }, []);

  // Lazily load the Pagefind runtime. It only exists in the built site, so the
  // import is dynamic and hidden from Vite (which cannot resolve /pagefind at
  // build time). We resolve it once, on the first open.
  const loadPagefind = useCallback(async (): Promise<Pagefind | null> => {
    if (pagefindRef.current) return pagefindRef.current;
    try {
      // Build the specifier at runtime so the bundler never sees a literal path
      // to resolve - the Pagefind runtime is generated at build time and does
      // not exist on disk when Vite/rolldown bundles this island. The
      // @vite-ignore directive is belt-and-suspenders for the same reason.
      const url = new URL('/pagefind/pagefind.js', window.location.origin).href;
      const mod = (await import(/* @vite-ignore */ url)) as Pagefind;
      await mod.init?.();
      pagefindRef.current = mod;
      return mod;
    } catch (err) {
      console.warn('[wdk] Pagefind unavailable:', err);
      setPagefindUnavailable(true);
      return null;
    }
  }, []);

  // Open requests arrive as a wdk:open-search event, dispatched by both the
  // header button and the global Cmd/Ctrl-K shortcut (wired in Header.astro so
  // the shortcut works before this island hydrates). Toggling here preserves the
  // press-again-to-close behavior of the shortcut. The island is mounted once
  // behind transition:persist, so this effect runs a single time and its cleanup
  // is the symmetric teardown - the listener never accumulates across
  // view-transition navigations.
  useEffect(() => {
    function onOpenRequest() {
      setOpen((prev) => !prev);
    }
    window.addEventListener('wdk:open-search', onOpenRequest);
    return () => {
      window.removeEventListener('wdk:open-search', onOpenRequest);
    };
  }, []);

  // When the modal opens, focus the input and warm up Pagefind.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    void loadPagefind();
  }, [open, loadPagefind]);

  // Run the search whenever the query changes (debounced). Responses for a
  // superseded query are dropped via the token check.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setHits([]);
      setActive(0);
      setLoading(false);
      setSearchError(null);
      return;
    }
    const token = ++queryToken.current;
    setLoading(true);
    setSearchError(null);
    const timer = setTimeout(async () => {
      try {
        const pf = await loadPagefind();
        if (!pf) {
          if (token === queryToken.current) {
            setHits([]);
            setPagefindUnavailable(true);
          }
          return;
        }
        const res = await pf.search(term);
        // Resolve the top handful of fragments; each may expand to sub-results.
        const datas = await Promise.all(res.results.slice(0, 8).map((r) => r.data()));
        if (token !== queryToken.current) return; // A newer query won.
        const flat = datas.flatMap(hitsFromData);
        setHits(flat);
        setActive(0);
      } catch (err) {
        if (token !== queryToken.current) return;
        console.warn('[wdk] Search failed:', err);
        setHits([]);
        setActive(0);
        setSearchError('Search failed. Try again in a moment.');
      } finally {
        if (token === queryToken.current) {
          setLoading(false);
        }
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [query, open, loadPagefind]);

  // Group hits by section while preserving Pagefind's relevance order. The
  // flattened, ordered list (used for keyboard nav) is rebuilt to match the
  // grouped render order so arrow keys track what the user sees.
  const { groups, ordered } = useMemo(() => {
    const bySection = new Map<string, Hit[]>();
    for (const hit of hits) {
      const list = bySection.get(hit.section) ?? [];
      list.push(hit);
      bySection.set(hit.section, list);
    }
    const groupList = Array.from(bySection, ([section, items]) => ({
      section,
      label: labelFor(section),
      items,
    }));
    const orderedHits = groupList.flatMap((g) => g.items);
    return { groups: groupList, ordered: orderedHits };
  }, [hits]);

  // Keyboard handling while the modal is open: arrows move the selection,
  // Enter navigates, Escape closes.
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, ordered.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const target = ordered[active];
        if (target) {
          e.preventDefault();
          window.location.href = target.url;
        }
      }
    },
    [active, ordered, close],
  );

  // Keep the active option scrolled into view as the selection moves.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="wdk-search"
      data-search-backdrop
      onMouseDown={(e) => {
        // Only a click on the backdrop itself (not a child) dismisses.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="wdk-search__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
      >
        <div className="wdk-search__head">
          <svg className="wdk-search__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.25" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            className="wdk-search__input"
            placeholder="Search the docs…"
            aria-label="Search documentation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="wdk-search__esc">Esc</kbd>
        </div>

        <div className="wdk-search__results" ref={listRef} role="listbox" aria-label="Search results">
          {query.trim() && !loading && pagefindUnavailable && (
            <p className="wdk-search__empty">
              Search is unavailable. Build the site to generate the search index.
            </p>
          )}
          {query.trim() && !loading && !pagefindUnavailable && searchError && (
            <p className="wdk-search__empty">{searchError}</p>
          )}
          {query.trim() && !loading && !pagefindUnavailable && !searchError && ordered.length === 0 && (
            <p className="wdk-search__empty">No results for “{query.trim()}”.</p>
          )}
          {!query.trim() && (
            <p className="wdk-search__hint">Start typing to search the documentation.</p>
          )}
          {groups.map((group) => (
            <div className="wdk-search__group" key={group.section}>
              <div className="wdk-search__group-label">{group.label}</div>
              {group.items.map((hit) => {
                flatIndex += 1;
                const index = flatIndex;
                const isActive = index === active;
                return (
                  <a
                    key={`${hit.url}-${index}`}
                    href={hit.url}
                    data-search-result
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    className={`wdk-search__hit${isActive ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="wdk-search__hit-title">{hit.title}</span>
                    {hit.excerpt && (
                      <span
                        className="wdk-search__hit-excerpt"
                        // Pagefind returns excerpts with <mark> highlight tags.
                        dangerouslySetInnerHTML={{ __html: hit.excerpt }}
                      />
                    )}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
