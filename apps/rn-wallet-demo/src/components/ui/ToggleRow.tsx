import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { Toggle } from './Toggle';

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  subtitle: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
});

// ToggleRow is a labelled switch row used in gateway configuration.
export function ToggleRow({
  title,
  subtitle,
  on,
  onChange,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Toggle
        on={on}
        onChange={onChange}
        accessibilityLabel={title}
        disabled={disabled}
      />
    </View>
  );
}
