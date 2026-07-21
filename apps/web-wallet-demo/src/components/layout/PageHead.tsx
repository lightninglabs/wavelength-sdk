import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/cn";

// UNDERLINE maps the accent prop to the short docs-style title bar. The
// per-screen accent lives here and nowhere else: controls keep their stable
// semantic colors regardless of screen.
const UNDERLINE: Record<string, string> = {
  teal: "bg-teal-fill",
  violet: "bg-violet-fill",
  sky: "bg-sky-fill",
  orange: "bg-orange-fill",
};

// PageHead is the full-bleed header bar atop authenticated sub-pages: a square
// back control, the title block with a docs-style accent underline, and an
// optional trailing slot, centred to the shared content width so it lines up
// with the Bands below it.
export function PageHead({
  title,
  subtitle,
  accent,
  onBack,
  trailing,
}: {
  title: string;
  subtitle: string;
  accent?: "teal" | "violet" | "sky" | "orange";
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="w-full pt-8 pb-2">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 lg:px-8">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center border
              border-border text-muted transition-colors hover:text-fg"
          >
            <ArrowLeft size={15} />
          </button>
        ) : null}
        <div>
          <h1 className="font-display text-lg font-semibold text-fg">
            {title}
          </h1>
          <span
            className={cn(
              "mt-1 mb-1.5 block h-[3px] w-12 rounded-full",
              accent ? UNDERLINE[accent] : "bg-border-strong",
            )}
          />
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {trailing ? <div className="ml-auto">{trailing}</div> : null}
      </div>
    </div>
  );
}
