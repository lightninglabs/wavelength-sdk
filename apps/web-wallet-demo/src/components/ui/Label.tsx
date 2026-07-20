import { ReactNode } from "react";
import { cn } from "../../lib/cn";

// SQUARE maps the accent prop to the small leading brand square.
const SQUARE: Record<string, string> = {
  teal: "bg-teal",
  violet: "bg-violet",
  sky: "bg-sky",
  orange: "bg-orange",
  lime: "bg-lime",
};

// Label is the uppercase eyebrow shown above sections and figures, in the docs
// site's lane-header form: a small accent square, the label text, and (when
// `rule` is set and the label owns its row) a hairline extending right.
export function Label({
  children,
  accent,
  rule = false,
}: {
  children: ReactNode;
  accent?: "teal" | "violet" | "sky" | "orange" | "lime";
  rule?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 text-[10px] font-semibold uppercase
        tracking-[0.16em] text-faint"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-[2px]",
          accent ? SQUARE[accent] : "bg-faint",
        )}
      />
      {children}
      {rule ? <span className="ml-1 h-px flex-1 bg-border" /> : null}
    </div>
  );
}
