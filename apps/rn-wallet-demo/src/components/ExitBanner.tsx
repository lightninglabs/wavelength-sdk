import { Pressable, Text, View } from 'react-native';
import { ChevronRight, LogOut } from 'lucide-react-native';
import { useWalletExits } from '@lightninglabs/wavelength-react';
import type { AppTab } from './layout/nav';
import { formatSats } from '../lib/format';
import { Palette, fonts } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    backgroundColor: p.accentSoft,
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  body: {
    flex: 1,
  },
  count: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  recovering: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  track: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
  },
  trackText: {
    color: p.accent,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
});

// ExitBanner surfaces in-progress exits above the wallet UI, mirroring the
// RecoveryBanner's full-bleed bar. A unilateral exit runs for hours or days,
// so the bar persists as an always-visible way back into the exit screen while
// any exit is still settling. It renders nothing when no exit is in flight.
export function ExitBanner({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { summary } = useWalletExits();
  if (!summary || summary.totalExits === 0) {
    return null;
  }

  const plural = summary.totalExits > 1 ? 's' : '';

  return (
    <Pressable
      testID="exit-banner"
      onPress={() => onNavigate('exit')}
      style={styles.row}
      accessibilityRole="button"
    >
      <LogOut size={16} color={palette.accent} />
      <Text style={styles.body}>
        <Text style={styles.count}>
          {summary.totalExits} exit{plural} in progress
        </Text>
        <Text style={styles.recovering}>
          {' · '}
          {formatSats(summary.totalEstNetRecoveredSat)} sats recovering
        </Text>
      </Text>
      <View style={styles.track}>
        <Text style={styles.trackText}>Track</Text>
        <ChevronRight size={14} color={palette.accent} />
      </View>
    </Pressable>
  );
}
