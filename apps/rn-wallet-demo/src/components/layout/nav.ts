import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  LayoutGrid,
  type LucideIcon,
  Settings,
} from 'lucide-react-native';

// AppTab is an authenticated (post-ready) destination. The runtime-lifecycle
// screens are NOT tabs: they are selected by wallet phase.
export type AppTab =
  | 'home'
  | 'receive'
  | 'send'
  | 'activity'
  | 'settings'
  | 'exit';

// NavAccent names a palette accent field usable as a nav destination's tint.
export type NavAccent = 'violet' | 'teal' | 'sky' | 'orange';

// NAV is the bottom tab bar's primary navigation. "Overview" maps to home.
// Each destination's icon carries that screen's brand accent (matching its
// page-title underline), so the tab bar echoes the docs site's multi-accent
// language. Labels stay neutral; only the icon is tinted.
export const NAV: Array<{
  id: AppTab;
  label: string;
  icon: LucideIcon;
  accent?: NavAccent;
}> = [
  { id: 'home', label: 'Overview', icon: LayoutGrid, accent: 'violet' },
  { id: 'activity', label: 'Activity', icon: Activity, accent: 'teal' },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft, accent: 'sky' },
  { id: 'send', label: 'Send', icon: ArrowUpRight, accent: 'orange' },
  { id: 'settings', label: 'Settings', icon: Settings },
];
