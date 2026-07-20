import { RefreshCw } from "lucide-react";
import {
  Entry,
  useWalletActivity,
  useWalletRefresh,
} from "@lightninglabs/wavelength-react";
import { ActivityRow } from "../../components/ActivityRow";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { InlineError } from "../../components/ui/InlineError";
import { Label } from "../../components/ui/Label";
import { cn } from "../../lib/cn";
import { dayLabel } from "../../lib/format";

// groupByDay buckets entries into ordered day groups, preserving the incoming
// (newest-first) order within and across groups.
function groupByDay(
  entries: readonly Entry[],
): Array<{ day: string; items: Entry[] }> {
  const groups: Array<{ day: string; items: Entry[] }> = [];

  for (const entry of entries) {
    const day = dayLabel(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(entry);
    } else {
      groups.push({ day, items: [entry] });
    }
  }

  return groups;
}

// ActivityScreen lists the full transaction history grouped by day, one band per
// day with the rows divided by hairlines. Activity and refresh are self-served
// from the provider; only tab routing comes from the caller. The app-wide poll
// for pending on-chain work in App.tsx covers this screen too, so it does not
// keep its own.
export function ActivityScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const activity = useWalletActivity();
  const { refresh, refreshPending, refreshError } = useWalletRefresh();

  const onRefresh = () => {
    void refresh().catch(() => undefined);
  };

  const groups = groupByDay(activity);

  return (
    <div>
      <PageHead
        title="Activity"
        subtitle="Complete payment history"
        accent="violet"
        onBack={() => onNavigate("home")}
        trailing={
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshPending}
            className="inline-flex items-center gap-1.5 border border-border
              px-3 py-2 text-xs font-medium text-muted transition-colors
              hover:text-fg disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshPending && "animate-spin")} />
            Refresh
          </button>
        }
      />
      {refreshError ? (
        <Band>
          <InlineError message={refreshError.message} />
        </Band>
      ) : null}
      {groups.length === 0 ? (
        <Band>
          <div className="py-6 text-center text-sm text-muted">
            No activity yet.
          </div>
        </Band>
      ) : (
        groups.map((group, gi) => (
          <Band key={`${group.day}-${gi}`} tinted={gi % 2 === 0}>
            <Label rule>{group.day}</Label>
            <div className="mt-2 divide-y divide-border border-t border-border">
              {group.items.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </div>
          </Band>
        ))
      )}
    </div>
  );
}
