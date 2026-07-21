import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  LayoutGrid,
  type LucideIcon,
  Settings,
} from "lucide-react";

// AppTab is an authenticated (post-ready) destination. The runtime-lifecycle
// screens are NOT tabs - they are selected by wallet phase.
export type AppTab =
  | "home"
  | "receive"
  | "send"
  | "activity"
  | "settings"
  | "exit";

// NAV is the primary navigation, shared by the top navbar and the mobile
// bottom bar. "Overview" maps to the home dashboard. Each destination's icon
// carries that screen's brand accent (matching its page-title underline), so
// the chrome echoes the docs site's multi-accent sections.
export const NAV: Array<{
  id: AppTab;
  label: string;
  icon: LucideIcon;
  iconClass?: string;
}> = [
  { id: "home", label: "Overview", icon: LayoutGrid, iconClass: "text-violet" },
  { id: "activity", label: "Activity", icon: Activity, iconClass: "text-teal" },
  { id: "receive", label: "Receive", icon: ArrowDownLeft, iconClass: "text-sky" },
  { id: "send", label: "Send", icon: ArrowUpRight, iconClass: "text-orange" },
  { id: "settings", label: "Settings", icon: Settings },
];

// CENTER_NAV is the desktop top-navbar links. Settings lives as a dedicated
// right-side icon button, so it is excluded here.
export const CENTER_NAV = NAV.filter((n) => n.id !== "settings");
