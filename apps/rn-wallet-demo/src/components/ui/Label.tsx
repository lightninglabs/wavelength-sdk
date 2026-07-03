import { ReactNode } from 'react';
import { Text } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  label: {
    color: p.faint,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
});

// Label is the uppercase eyebrow shown above sections and figures.
export function Label({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);

  return <Text style={styles.label}>{children}</Text>;
}
