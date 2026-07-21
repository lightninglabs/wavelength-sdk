import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// PageHeadAccent names the docs-style title-underline tint. The per-screen
// accent lives here and nowhere else: controls keep their stable semantic
// colors regardless of screen.
export type PageHeadAccent = 'teal' | 'violet' | 'sky' | 'orange';

// FILL resolves an accent name to its bright fill field; the underline carries
// no text, so it uses the fill hue rather than the darkened text one.
const FILL: Record<
  PageHeadAccent,
  'fillTeal' | 'fillViolet' | 'fillSky' | 'fillOrange'
> = {
  teal: 'fillTeal',
  violet: 'fillViolet',
  sky: 'fillSky',
  orange: 'fillOrange',
};

const makeStyles = (p: Palette) => ({
  wrap: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  back: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center' as const,
    width: 32,
  },
  title: {
    color: p.text,
    fontFamily: fonts.display,
    fontSize: 18,
  },
  underline: {
    borderRadius: 2,
    height: 3,
    marginBottom: 6,
    marginTop: 4,
    width: 48,
  },
  subtitle: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  trailing: {
    marginLeft: 'auto' as const,
  },
});

// PageHead is the header atop authenticated sub-pages: a square back control,
// the title block with a docs-style accent underline, and an optional
// trailing slot.
export function PageHead({
  title,
  subtitle,
  accent,
  onBack,
  trailing,
}: {
  title: string;
  subtitle: string;
  accent?: PageHeadAccent;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const underlineColor = accent ? palette[FILL[accent]] : palette.borderStrong;

  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Back">
          <ArrowLeft size={15} color={palette.muted} />
        </Pressable>
      ) : null}
      <View>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.underline, { backgroundColor: underlineColor }]} />
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}
