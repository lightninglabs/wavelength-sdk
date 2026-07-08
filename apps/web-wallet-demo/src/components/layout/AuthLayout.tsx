import { ReactNode } from "react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { BrandPanel } from "./BrandPanel";

// AuthLayout is the split onboarding structure: a brand panel on the left and
// the routed form on the right, stacking on mobile. A theme toggle sits in the
// top-right corner so the palette can be switched before signing in. An optional
// footer slot sits in the bottom-right corner, mirroring the brand panel's own
// footer across the split, for quiet page-level affordances.
export function AuthLayout({
  children,
  network,
  wide = false,
  footer,
}: {
  children: ReactNode;
  network: string;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="relative grid min-h-screen w-full bg-bg text-fg lg:grid-cols-2">
      <BrandPanel network={network} />
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full" style={{ maxWidth: wide ? 540 : 420 }}>
          {children}
        </div>
      </div>
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      {footer ? (
        // On desktop the lg:bottom-12/lg:right-12 inset mirrors the brand
        // panel's footer across the split: that footer sits 3rem in, from the
        // panel's own p-12. Below lg the panel is hidden, so the slot falls
        // back to the same corner inset as the theme toggle above it.
        <div
          className="absolute bottom-4 right-4 z-10 sm:bottom-6 sm:right-6
            lg:bottom-12 lg:right-12"
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
