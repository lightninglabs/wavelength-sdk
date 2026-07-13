import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

// Select is a labelled single-choice picker matched to the dark/light
// surface, rendered as a styled native select element.
export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            `w-full cursor-pointer appearance-none border border-border
            bg-well px-3 py-2.5 text-sm text-fg outline-none
            transition-colors focus:border-border-strong
            disabled:cursor-not-allowed disabled:text-muted`,
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </label>
  );
}
