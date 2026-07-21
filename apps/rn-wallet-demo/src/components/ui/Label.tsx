import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// LabelAccent names a palette accent field usable as the label's leading
// square.
export type LabelAccent = 'teal' | 'violet' | 'sky' | 'orange' | 'lime';

// FILL resolves an accent name to its bright fill field; the square carries no
// text, so it uses the fill hue rather than the darkened text one.
const FILL: Record<LabelAccent, 'fillTeal' | 'fillViolet' | 'fillSky' | 'fillOrange' | 'fillLime'> = {
  teal: 'fillTeal',
  violet: 'fillViolet',
  sky: 'fillSky',
  orange: 'fillOrange',
  lime: 'fillLime',
};

const makeStyles = (p: Palette) => ({
  wrap: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  square: {
    borderRadius: 2,
    height: 6,
    width: 6,
  },
  label: {
    color: p.faint,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  rule: {
    backgroundColor: p.border,
    flex: 1,
    height: 1,
    marginLeft: 4,
  },
});

// Label is the uppercase eyebrow shown above sections and figures, in the
// docs site's lane-header form: a small accent square, the label text, and
// (when `rule` is set and the label owns its row) a hairline extending right.
export function Label({
  children,
  accent,
  rule = false,
}: {
  children: ReactNode;
  accent?: LabelAccent;
  rule?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const squareColor = accent ? palette[FILL[accent]] : palette.faint;

  return (
    <View style={styles.wrap}>
      <View style={[styles.square, { backgroundColor: squareColor }]} />
      <Text style={styles.label}>{children}</Text>
      {rule ? <View style={styles.rule} /> : null}
    </View>
  );
}
