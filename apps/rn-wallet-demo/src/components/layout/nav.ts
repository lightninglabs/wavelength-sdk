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

// NAV is the bottom tab bar's primary navigation. "Overview" maps to home.
export const NAV: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Overview', icon: LayoutGrid },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
  { id: 'send', label: 'Send', icon: ArrowUpRight },
  { id: 'settings', label: 'Settings', icon: Settings },
];
