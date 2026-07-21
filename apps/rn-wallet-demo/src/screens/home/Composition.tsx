import { Text, View } from 'react-native';
import { Balance } from '@lightninglabs/wavelength-react';
import {
  ALWAYS_SHOWN_BUCKETS,
  BucketKey,
  compositionBuckets,
} from '../../lib/balance';
import { formatSats, pct } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  meter: {
    backgroundColor: p.border,
    borderRadius: 5,
    flexDirection: 'row' as const,
    height: 10,
    overflow: 'hidden' as const,
  },
  rows: {
    gap: 14,
    marginTop: 20,
  },
  bucketHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  bucketLabelRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  bucketDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  bucketLabel: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  bucketValue: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  bucketPct: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
});

// Composition is the balance-composition graph: a segmented meter over
// per-bucket rows (Ark VTXO, incoming, outgoing).
export function Composition({ balance }: { balance: Balance | null }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Bucket tones map to the palette (the web uses CSS variables for this).
  // Spendable VTXO is teal (the Ark identity color), incoming is sky, outgoing
  // is orange, and the credit rails derive from teal and muted.
  const tone: Record<BucketKey, string> = {
    vtxo: palette.fillTeal,
    creditAvailable: palette.tealSoft,
    incoming: palette.fillSky,
    outgoing: palette.fillOrange,
    creditReserved: palette.muted,
  };
  const buckets = compositionBuckets(balance);
  const total = buckets.reduce((sum, b) => sum + b.sat, 0) || 1;
  const shown = buckets.filter(
    (b) => b.sat > 0 || ALWAYS_SHOWN_BUCKETS.includes(b.key),
  );

  return (
    <View>
      <View style={styles.meter}>
        {shown.map((b) =>
          b.sat > 0 ? (
            <View
              key={b.key}
              style={{ backgroundColor: tone[b.key], flex: b.sat / total }}
            />
          ) : null,
        )}
      </View>
      <View style={styles.rows}>
        {shown.map((b) => (
          <View key={b.key}>
            <View style={styles.bucketHead}>
              <View style={styles.bucketLabelRow}>
                <View style={[styles.bucketDot, { backgroundColor: tone[b.key] }]} />
                <Text style={styles.bucketLabel}>{b.label}</Text>
              </View>
              <Text style={styles.bucketValue}>{formatSats(b.sat)}</Text>
            </View>
            <Text style={styles.bucketPct}>{pct(b.sat, total).toFixed(1)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
