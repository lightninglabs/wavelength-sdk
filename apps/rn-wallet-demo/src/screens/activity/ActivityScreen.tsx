import { RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  Entry,
  useWalletActivity,
  useWalletRefresh,
} from '@lightninglabs/wavelength-react';
import { ActivityRow } from '../../components/ActivityRow';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { dayLabel } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

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

const makeStyles = (p: Palette) => ({
  list: {
    borderColor: p.border,
    borderTopWidth: 1,
    marginTop: 8,
  },
  divider: {
    borderColor: p.border,
    borderTopWidth: 1,
  },
  empty: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: 'center' as const,
  },
});

// ActivityScreen lists the full transaction history grouped by day, one band
// per day, refreshed by pull-to-refresh. Activity and refresh are self-served
// from the provider; only tab routing comes from the caller. The app-wide poll
// for pending on-chain work in WalletApp.tsx covers this screen too, so it
// does not keep its own.
export function ActivityScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const activity = useWalletActivity();
  const { refresh, refreshPending, refreshError } = useWalletRefresh();
  const groups = groupByDay(activity);

  const onRefresh = () => {
    void refresh().catch(() => undefined);
  };

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshPending}
          onRefresh={onRefresh}
          tintColor={palette.accent}
          colors={[palette.accent]}
        />
      }
    >
      <PageHead
        title="Activity"
        subtitle="Complete payment history"
        onBack={() => onNavigate('home')}
      />
      {refreshError ? (
        <Band>
          <InlineError message={refreshError.message} />
        </Band>
      ) : null}
      {groups.length === 0 ? (
        <Band>
          <Text style={styles.empty}>No activity yet.</Text>
        </Band>
      ) : (
        groups.map((group, gi) => (
          <Band key={`${group.day}-${gi}`} tinted={gi % 2 === 0}>
            <Label>{group.day}</Label>
            <View style={styles.list}>
              {group.items.map((entry, i) => (
                <View key={entry.id} style={i > 0 && styles.divider}>
                  <ActivityRow entry={entry} />
                </View>
              ))}
            </View>
          </Band>
        ))
      )}
    </ScrollView>
  );
}
