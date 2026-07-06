import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  band: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    width: '100%' as const,
  },
  tinted: {
    backgroundColor: p.surfaceAlt,
    borderBottomWidth: 1,
    borderColor: p.border,
    borderTopWidth: 1,
  },
});

// Band is the core Zones surface: a full-bleed horizontal section whose tint
// (with hairline edges) separates it from its neighbors.
export function Band({
  children,
  tinted,
  style,
}: {
  children: ReactNode;
  tinted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.band, tinted && styles.tinted, style]}>{children}</View>
  );
}
