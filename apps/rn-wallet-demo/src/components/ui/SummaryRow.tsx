import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
  },
  label: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  value: {
    color: p.text,
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'right' as const,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
});

// SummaryRow renders a label/value pair used in the send and settings cards.
export function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
