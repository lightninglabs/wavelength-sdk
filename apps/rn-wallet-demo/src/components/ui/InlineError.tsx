import { Text, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  row: {
    flexDirection: 'row' as const,
    gap: 8,
    alignItems: 'flex-start' as const,
  },
  text: {
    color: p.bad,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
});

// InlineError renders a form-level error message, or nothing when empty.
export function InlineError({ message }: { message: string }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!message) {
    return null;
  }

  return (
    <View
      style={styles.row}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <TriangleAlert size={15} color={palette.bad} style={{ marginTop: 2 }} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
