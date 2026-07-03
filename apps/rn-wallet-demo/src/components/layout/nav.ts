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
export type AppTab = 'home' | 'receive' | 'send' | 'activity' | 'settings';

// NAV is the bottom tab bar's primary navigation. "Overview" maps to home.
export const NAV: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Overview', icon: LayoutGrid },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'receive', label: 'Receive', icon: ArrowDownLeft },
  { id: 'send', label: 'Send', icon: ArrowUpRight },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// ChromeStatus is the runtime summary the top bar renders: the connection dot,
// the phase label, and the network. Identity lives on the Settings screen on
// mobile, so no pubkey is carried here.
export type ChromeStatus = {
  phaseLabel: string;
  network: string;
  connected: boolean;
};
