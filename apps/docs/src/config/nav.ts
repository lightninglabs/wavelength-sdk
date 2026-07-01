/**
 * Pure nav config - no Astro runtime imports so Playwright can import this directly.
 * Sidebar order follows developer journey: learn, build, reference, operations.
 */

export type Accent = 'violet' | 'teal' | 'lime' | 'orange' | 'sky';

export interface NavItem {
  slug: string;
  label: string;
  /** Section key used for accent lookup and prevNext grouping. */
  section: string;
}

export interface NavGroup {
  label: string;
  /** Section key - matches the section field on all items in this group. */
  section: string;
  items: NavItem[];
}

/** Primary header links (desktop top bar). Get started stays a separate CTA. */
export interface TopNavItem {
  label: string;
  slug: string;
  /** Path prefixes that mark this top-nav item active. */
  prefixes: string[];
}

export const TOP_NAV: TopNavItem[] = [
  {
    label: 'Docs',
    slug: 'introduction/what-is-walletdk',
    prefixes: ['/introduction', '/web/get-started', '/web/integrations', '/web/runtime', '/web/support'],
  },
  {
    label: 'Guides',
    slug: 'web/guides/create-a-wallet',
    prefixes: ['/web/guides'],
  },
  {
    label: 'Reference',
    slug: 'reference/walletdk-core',
    prefixes: ['/reference', '/web/reference'],
  },
  {
    label: 'Concepts',
    slug: 'concepts/balances-and-vtxos',
    prefixes: ['/concepts', '/glossary'],
  },
];

/**
 * NAV sidebar order: journey-first (learn, build, reference, operations).
 * URLs are unchanged; only display order and grouping differ from the IA tree.
 */
export const NAV: NavGroup[] = [
  // -- LEARN --
  {
    label: 'Introduction',
    section: 'introduction',
    items: [
      { slug: 'introduction/the-swapdk-system', label: 'The SwapDK system', section: 'introduction' },
      { slug: 'introduction/what-is-walletdk', label: 'What is WalletDK', section: 'introduction' },
      { slug: 'introduction/system-architecture', label: 'System architecture', section: 'introduction' },
    ],
  },
  {
    label: 'Concepts',
    section: 'concepts',
    items: [
      { slug: 'concepts/balances-and-vtxos', label: 'Balances and VTXOs', section: 'concepts' },
      { slug: 'concepts/activity-and-events', label: 'Activity and events', section: 'concepts' },
      { slug: 'concepts/wallet-lifecycle-and-auth', label: 'Wallet lifecycle and auth', section: 'concepts' },
      { slug: 'concepts/lightning-payments-are-swaps', label: 'Lightning payments are swaps', section: 'concepts' },
      { slug: 'concepts/networks-and-config', label: 'Networks and config', section: 'concepts' },
      { slug: 'concepts/leaving-ark', label: 'Leaving Ark', section: 'concepts' },
    ],
  },
  // -- WEB SDK (BUILD) --
  {
    label: 'Get started',
    section: 'get-started',
    items: [
      { slug: 'web/get-started/quickstart', label: 'Quickstart', section: 'get-started' },
      { slug: 'web/get-started/run-the-demo-app', label: 'Run the demo app', section: 'get-started' },
      { slug: 'web/get-started/installation', label: 'Installation', section: 'get-started' },
      { slug: 'web/get-started/requirements', label: 'Requirements', section: 'get-started' },
      { slug: 'web/get-started/hosting-runtime-assets', label: 'Hosting runtime assets', section: 'get-started' },
      { slug: 'web/get-started/cross-origin-isolation', label: 'Cross-origin isolation', section: 'get-started' },
    ],
  },
  {
    label: 'Integrations',
    section: 'integrations',
    items: [
      { slug: 'web/integrations/react', label: 'React', section: 'integrations' },
    ],
  },
  {
    label: 'Guides',
    section: 'guides',
    items: [
      { slug: 'web/guides/create-a-wallet', label: 'Create a wallet', section: 'guides' },
      { slug: 'web/guides/get-a-deposit-address', label: 'Get a deposit address', section: 'guides' },
      { slug: 'web/guides/show-balance-and-activity', label: 'Show balance and activity', section: 'guides' },
      { slug: 'web/guides/send-a-payment', label: 'Send a payment', section: 'guides' },
      { slug: 'web/guides/receive-a-lightning-payment', label: 'Receive a Lightning payment', section: 'guides' },
      { slug: 'web/guides/use-a-passkey', label: 'Use a passkey', section: 'guides' },
      { slug: 'web/guides/handle-phases-and-errors', label: 'Handle phases and errors', section: 'guides' },
      { slug: 'web/guides/unilateral-exit', label: 'Unilateral exit', section: 'guides' },
    ],
  },
  // -- REFERENCE --
  {
    label: 'Reference',
    section: 'reference',
    items: [
      { slug: 'reference/walletdk-core', label: 'walletdk-core', section: 'reference' },
      { slug: 'web/reference/walletdk-web', label: 'walletdk-web', section: 'reference' },
      { slug: 'web/reference/walletdk-react', label: 'walletdk-react', section: 'reference' },
    ],
  },
  // -- OPERATIONS --
  {
    label: 'Web runtime',
    section: 'runtime',
    items: [
      { slug: 'web/runtime/data-and-persistence', label: 'Data and persistence', section: 'runtime' },
    ],
  },
  {
    label: 'Support',
    section: 'support',
    items: [
      { slug: 'web/support/browser-support', label: 'Browser support', section: 'support' },
      { slug: 'web/support/demo-app', label: 'Demo app', section: 'support' },
      { slug: 'web/support/troubleshooting', label: 'Troubleshooting', section: 'support' },
    ],
  },
  {
    label: 'Glossary',
    section: 'glossary',
    items: [
      { slug: 'glossary', label: 'Glossary', section: 'glossary' },
    ],
  },
];

/**
 * Maps section keys (matching path prefixes) to their accent color.
 */
export const SECTION_ACCENT: Record<string, Accent> = {
  introduction: 'violet',
  'get-started': 'violet',
  concepts: 'teal',
  glossary: 'teal',
  guides: 'lime',
  integrations: 'lime',
  reference: 'orange',
  runtime: 'orange',
  support: 'sky',
};

/**
 * Returns a flat list of all nav items in depth-first order.
 * Each item carries its slug, display label, and section key.
 */
export function flattenNav(): NavItem[] {
  const result: NavItem[] = [];
  for (const group of NAV) {
    for (const item of group.items) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Returns the accent color for a given slug by matching the slug's section.
 * Falls back to violet when no match is found.
 */
export function accentForSlug(slug: string): Accent {
  const flat = flattenNav();
  const item = flat.find((i) => i.slug === slug);
  if (item) {
    return SECTION_ACCENT[item.section] ?? 'violet';
  }
  // Path-prefix fallback mirrors the inline head script logic.
  if (slug.startsWith('concepts/') || slug === 'glossary' || slug.startsWith('glossary/')) {
    return 'teal';
  }
  if (slug.startsWith('web/guides/') || slug.startsWith('web/integrations/')) {
    return 'lime';
  }
  if (
    slug.startsWith('reference/') ||
    slug.startsWith('web/reference/') ||
    slug.startsWith('web/runtime/')
  ) {
    return 'orange';
  }
  if (slug.startsWith('web/support/')) {
    return 'sky';
  }
  return 'violet';
}

export interface PrevNext {
  prev?: NavItem;
  next?: NavItem;
  /** Zero-based position within the flattened nav. */
  index: number;
  /** Total number of items in this slug's section. */
  total: number;
  /** Section label for this slug (e.g. 'guides', 'concepts'). */
  section: string;
}

/**
 * Returns prev/next navigation info for a given slug.
 * - index: position in the full flattened nav.
 * - total: count of items sharing the same section key.
 * - section: the section key (e.g. 'guides').
 * - prev/next: adjacent items in the full flattened order.
 */
export function prevNext(slug: string): PrevNext {
  const flat = flattenNav();
  const index = flat.findIndex((i) => i.slug === slug);
  if (index === -1) {
    return { index: -1, total: 0, section: '' };
  }
  const item = flat[index];
  const section = item.section;
  const total = flat.filter((i) => i.section === section).length;
  return {
    prev: index > 0 ? flat[index - 1] : undefined,
    next: index < flat.length - 1 ? flat[index + 1] : undefined,
    index,
    total,
    section,
  };
}

/** True when pathname matches any prefix on a top-nav item. */
export function isTopNavActive(pathname: string, item: TopNavItem): boolean {
  return item.prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
