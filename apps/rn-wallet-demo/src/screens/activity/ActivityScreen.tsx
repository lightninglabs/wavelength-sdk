import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Balance, Entry } from '@lightninglabs/walletdk-react';
import { ActivityRow } from '../../components/ActivityRow';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { Label } from '../../components/ui/Label';
import { normalizeActivity } from '../../lib/balance';
import { dayLabel } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// groupByDay buckets entries into ordered day groups, preserving the incoming
// (newest-first) order within and across groups.
function groupByDay(entries: Entry[]): Array<{ day: string; items: Entry[] }> {
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
// per day, refreshed by pull-to-refresh.
export function ActivityScreen({
  activity,
  balance,
  onNavigate,
  onRefresh,
  busy,
}: {
  activity: Entry[];
  balance: Balance | null;
  onNavigate: (tab: AppTab) => void;
  onRefresh: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const groups = groupByDay(normalizeActivity(activity, balance));

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={busy}
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
