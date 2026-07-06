import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { CopyButton } from './CopyButton';

const makeStyles = (p: Palette) => ({
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
  },
  label: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  valueBox: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  value: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
});

// CopyRow shows a labelled monospace value with an inline copy control.
export function CopyRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <CopyButton value={value} />
      </View>
      <View style={styles.valueBox}>
        <Text style={styles.value} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}
