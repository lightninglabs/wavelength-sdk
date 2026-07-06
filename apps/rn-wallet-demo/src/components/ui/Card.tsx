import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
  },
});

// Card is a flat, square-cornered surface with a hairline border, kept for
// the few places that need a self-contained bordered panel.
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeStyles);

  return <View style={[styles.card, style]}>{children}</View>;
}
