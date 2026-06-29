import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../../lib/cn";

// CopyButton writes a value to the clipboard and shows a transient "Copied"
// confirmation.
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (!navigator.clipboard) {
            throw new Error("clipboard unavailable");
          }
          await navigator.clipboard.writeText(value);
          // Only confirm after the write resolves, so a denied or failed copy
          // never shows a false "Copied".
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        } catch {
          // Clipboard may be unavailable or the write may reject (permissions,
          // focus); leave the button in its default state on failure.
        }
      }}
      className={cn(
        `inline-flex items-center gap-1.5 border border-border px-2 py-1
        text-xs font-medium transition-colors`,
        done ? "text-good" : "text-muted",
      )}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
      {done ? "Copied" : label}
    </button>
  );
}
