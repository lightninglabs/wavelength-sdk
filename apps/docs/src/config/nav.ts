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
      { slug: 'introduction/what-is-walletdk', label: 'What is WalletDK', section: 'introduction' },
      { slug: 'introduction/the-swapdk-system', label: 'The SwapDK system', section: 'introduction' },
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
  // -- WEB PLATFORM (BUILD) --
  {
    label: 'Web',
    section: 'web',
    items: [
      { slug: 'web/get-started/quickstart', label: 'Quickstart', section: 'web' },
      { slug: 'web/get-started/run-the-demo-app', label: 'Run the demo app', section: 'web' },
      { slug: 'web/support/demo-app', label: 'Demo app', section: 'web' },
      { slug: 'web/get-started/installation', label: 'Installation', section: 'web' },
      { slug: 'web/get-started/requirements', label: 'Requirements', section: 'web' },
      { slug: 'web/get-started/hosting-runtime-assets', label: 'Hosting runtime assets', section: 'web' },
      { slug: 'web/get-started/cross-origin-isolation', label: 'Cross-origin isolation', section: 'web' },
      { slug: 'web/runtime/data-and-persistence', label: 'Data and persistence', section: 'web' },
      { slug: 'web/support/browser-support', label: 'Browser support', section: 'web' },
      { slug: 'web/support/troubleshooting', label: 'Troubleshooting', section: 'web' },
    ],
  },
  // -- REACT NATIVE PLATFORM (BUILD) --
  {
    label: 'React Native',
    section: 'react-native',
    items: [
      { slug: 'react-native/get-started/quickstart', label: 'Quickstart', section: 'react-native' },
      { slug: 'react-native/get-started/run-the-demo-app', label: 'Run the demo app', section: 'react-native' },
      { slug: 'react-native/get-started/installation', label: 'Installation', section: 'react-native' },
      { slug: 'react-native/get-started/requirements', label: 'Requirements', section: 'react-native' },
      { slug: 'react-native/get-started/passkey-setup', label: 'Passkey setup', section: 'react-native' },
      { slug: 'react-native/troubleshooting', label: 'Troubleshooting', section: 'react-native' },
    ],
  },
  {
    label: 'Integrations',
    section: 'integrations',
    items: [
      { slug: 'integrations/react', label: 'React', section: 'integrations' },
    ],
  },
  {
    label: 'Guides',
    section: 'guides',
    items: [
      { slug: 'guides/create-a-wallet', label: 'Create a wallet', section: 'guides' },
      { slug: 'guides/restore-a-wallet', label: 'Restore a wallet', section: 'guides' },
      { slug: 'guides/get-a-deposit-address', label: 'Get a deposit address', section: 'guides' },
      { slug: 'guides/show-balance-and-activity', label: 'Show balance and activity', section: 'guides' },
      { slug: 'guides/send-a-payment', label: 'Send a payment', section: 'guides' },
      { slug: 'guides/receive-a-lightning-payment', label: 'Receive a Lightning payment', section: 'guides' },
      { slug: 'guides/use-a-passkey', label: 'Use a passkey', section: 'guides' },
      { slug: 'guides/handle-phases-and-errors', label: 'Handle phases and errors', section: 'guides' },
      { slug: 'guides/unilateral-exit', label: 'Unilateral exit', section: 'guides' },
    ],
  },
  // -- REFERENCE --
  {
    label: 'Reference',
    section: 'reference',
    items: [
      { slug: 'reference/walletdk-core', label: 'walletdk-core', section: 'reference' },
      { slug: 'reference/walletdk-react', label: 'walletdk-react', section: 'reference' },
      { slug: 'reference/walletdk-web', label: 'walletdk-web', section: 'reference' },
      { slug: 'reference/walletdk-react-native', label: 'walletdk-react-native', section: 'reference' },
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

export type SliceKey = 'sdk' | 'api' | 'cli' | 'agents';

/** One top-level documentation slice, switched via the header tabs. */
export interface Slice {
  key: SliceKey;
  /** Header tab label. */
  label: string;
  /** Landing URL for the header tab. */
  href: string;
  /** Path prefixes that mark this slice active. The SDK slice is the catch-all. */
  prefixes: string[];
  nav: NavGroup[];
}

/** API slice sidebar. RPC grouping is curated here, never inferred. */
export const API_NAV: NavGroup[] = [
  {
    label: 'Overview',
    section: 'api-overview',
    items: [
      { slug: 'api', label: 'API overview', section: 'api-overview' },
      { slug: 'api/get-started', label: 'Get started', section: 'api-overview' },
      { slug: 'api/rest', label: 'REST conventions', section: 'api-overview' },
    ],
  },
  {
    label: 'Wallet lifecycle',
    section: 'api-lifecycle',
    items: [
      { slug: 'api/wallet/create', label: 'Create', section: 'api-lifecycle' },
      { slug: 'api/wallet/unlock', label: 'Unlock', section: 'api-lifecycle' },
      { slug: 'api/wallet/status', label: 'Status', section: 'api-lifecycle' },
    ],
  },
  {
    label: 'Sending',
    section: 'api-send',
    items: [
      { slug: 'api/wallet/prepare-send', label: 'PrepareSend', section: 'api-send' },
      { slug: 'api/wallet/send', label: 'Send', section: 'api-send' },
    ],
  },
  {
    label: 'Receiving',
    section: 'api-receive',
    items: [
      { slug: 'api/wallet/recv', label: 'Recv', section: 'api-receive' },
      { slug: 'api/wallet/deposit', label: 'Deposit', section: 'api-receive' },
    ],
  },
  {
    label: 'Balance and activity',
    section: 'api-activity',
    items: [
      { slug: 'api/wallet/balance', label: 'Balance', section: 'api-activity' },
      { slug: 'api/wallet/list', label: 'List', section: 'api-activity' },
      { slug: 'api/wallet/subscribe-wallet', label: 'SubscribeWallet', section: 'api-activity' },
      { slug: 'api/wallet/inspect-activity', label: 'InspectActivity', section: 'api-activity' },
    ],
  },
  {
    label: 'Exit and sweep',
    section: 'api-exit',
    items: [
      { slug: 'api/wallet/get-exit-plan', label: 'GetExitPlan', section: 'api-exit' },
      { slug: 'api/wallet/exit', label: 'Exit', section: 'api-exit' },
      { slug: 'api/wallet/exit-status', label: 'ExitStatus', section: 'api-exit' },
      { slug: 'api/wallet/sweep-wallet', label: 'SweepWallet', section: 'api-exit' },
    ],
  },
];

/** CLI slice sidebar: one page per top-level darepocli command. */
export const CLI_NAV: NavGroup[] = [
  {
    label: 'Overview',
    section: 'cli-overview',
    items: [
      { slug: 'cli', label: 'darepocli', section: 'cli-overview' },
    ],
  },
  {
    label: 'Wallet',
    section: 'cli-wallet',
    items: [
      { slug: 'cli/create', label: 'create', section: 'cli-wallet' },
      { slug: 'cli/unlock', label: 'unlock', section: 'cli-wallet' },
      { slug: 'cli/send', label: 'send', section: 'cli-wallet' },
      { slug: 'cli/recv', label: 'recv', section: 'cli-wallet' },
      { slug: 'cli/activity', label: 'activity', section: 'cli-wallet' },
      { slug: 'cli/balance', label: 'balance', section: 'cli-wallet' },
      { slug: 'cli/exit', label: 'exit', section: 'cli-wallet' },
      { slug: 'cli/wallet-sweep', label: 'wallet-sweep', section: 'cli-wallet' },
    ],
  },
  {
    label: 'Daemon',
    section: 'cli-daemon',
    items: [
      { slug: 'cli/getinfo', label: 'getinfo', section: 'cli-daemon' },
      { slug: 'cli/schema', label: 'schema', section: 'cli-daemon' },
      { slug: 'cli/mcp', label: 'mcp', section: 'cli-daemon' },
    ],
  },
  {
    label: 'Advanced',
    section: 'cli-advanced',
    items: [
      { slug: 'cli/ark', label: 'ark', section: 'cli-advanced' },
      { slug: 'cli/recovery', label: 'recovery', section: 'cli-advanced' },
      { slug: 'cli/swap', label: 'swap', section: 'cli-advanced' },
      { slug: 'cli/dev', label: 'dev', section: 'cli-advanced' },
    ],
  },
];

/** Agents slice sidebar: a single hub page for agent-assisted integration. */
export const AGENTS_NAV: NavGroup[] = [
  {
    label: 'Agents',
    section: 'agents',
    items: [
      { slug: 'agents', label: 'Build with agents', section: 'agents' },
    ],
  },
];

export const SLICES: Slice[] = [
  {
    key: 'sdk',
    label: 'SDK',
    href: '/introduction/what-is-walletdk/',
    prefixes: [],
    nav: NAV,
  },
  { key: 'api', label: 'API', href: '/api/', prefixes: ['/api'], nav: API_NAV },
  { key: 'cli', label: 'CLI', href: '/cli/', prefixes: ['/cli'], nav: CLI_NAV },
  { key: 'agents', label: 'Agents', href: '/agents/', prefixes: ['/agents'], nav: AGENTS_NAV },
];

/** One way to integrate WalletDK: a labelled entry point. */
export interface Surface {
  label: string;
  href: string;
}

/**
 * The integration surfaces, in the same order the home page presents them.
 * Canonical list shared by the home Surfaces band's intent and the footer's
 * Integrate column so the two stay in sync.
 */
export const SURFACES: Surface[] = [
  { label: 'Web SDK', href: '/web/get-started/quickstart/' },
  { label: 'React Native SDK', href: '/react-native/get-started/quickstart/' },
  { label: 'API', href: '/api/' },
  { label: 'CLI', href: '/cli/' },
  { label: 'Agents', href: '/agents/' },
];

/** Returns the slice owning a pathname; the SDK slice is the fallback. */
export function sliceForPath(pathname: string): Slice {
  const match = SLICES.find((s) =>
    s.prefixes.some((p) => pathname === p || pathname === `${p}/` || pathname.startsWith(`${p}/`)),
  );
  return match ?? SLICES[0];
}

/** Returns the slice owning a content slug (no leading or trailing slash). */
export function sliceForSlug(slug: string): Slice {
  return sliceForPath(`/${slug}/`);
}

/**
 * Maps section keys (matching path prefixes) to their accent color.
 */
export const SECTION_ACCENT: Record<string, Accent> = {
  introduction: 'violet',
  concepts: 'teal',
  glossary: 'teal',
  guides: 'lime',
  integrations: 'lime',
  reference: 'orange',
  web: 'violet',
  'react-native': 'sky',
  'api-overview': 'violet',
  'api-lifecycle': 'teal',
  'api-send': 'lime',
  'api-receive': 'sky',
  'api-activity': 'orange',
  'api-exit': 'violet',
  'cli-overview': 'violet',
  'cli-wallet': 'teal',
  'cli-daemon': 'orange',
  'cli-advanced': 'sky',
  agents: 'sky',
};

/**
 * Returns a flat list of nav items in depth-first order.
 * Each item carries its slug, display label, and section key.
 * Defaults to the full NAV; pass a subset of groups to flatten only those.
 */
export function flattenNav(groups: NavGroup[] = NAV): NavItem[] {
  const result: NavItem[] = [];
  for (const group of groups) {
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
  for (const slice of SLICES) {
    const item = flattenNav(slice.nav).find((i) => i.slug === slug);
    if (item) {
      return SECTION_ACCENT[item.section] ?? 'violet';
    }
  }
  // Path-prefix fallback mirrors the inline head script logic.
  if (slug.startsWith('concepts/') || slug === 'glossary' || slug.startsWith('glossary/')) {
    return 'teal';
  }
  if (slug.startsWith('guides/') || slug.startsWith('integrations/')) {
    return 'lime';
  }
  if (slug.startsWith('reference/')) {
    return 'orange';
  }
  if (slug.startsWith('react-native/')) {
    return 'sky';
  }
  if (slug.startsWith('web/')) {
    return 'violet';
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
  const flat = flattenNav(sliceForSlug(slug).nav);
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
