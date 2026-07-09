import { ReactNode } from "react";
import { AppTab } from "./nav";
import { TopNav } from "./TopNav";
import { BottomBar } from "./BottomBar";

// AppShell is the authenticated app frame: a full-width top navbar, the routed
// screen, and a mobile bottom tab bar. network is the connect form's chosen
// network, passed through to TopNav as a fallback label until the wallet's
// own info reports one.
export function AppShell({
  tab,
  onTab,
  onStop,
  network,
  children,
}: {
  tab: AppTab;
  onTab: (tab: AppTab) => void;
  onStop: () => void;
  network: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-bg text-fg">
      <TopNav tab={tab} onTab={onTab} onStop={onStop} network={network} />
      <main className="w-full flex-1 pb-24 lg:pb-12">{children}</main>
      <BottomBar tab={tab} onTab={onTab} />
    </div>
  );
}
