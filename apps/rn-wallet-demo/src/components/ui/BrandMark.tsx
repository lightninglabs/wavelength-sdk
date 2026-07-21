import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// CLUSTER lists the five accent squares in the docs header's order. The
// squares carry no text, so they take the bright fill hues.
const CLUSTER: ReadonlyArray<
  'fillViolet' | 'fillTeal' | 'fillLime' | 'fillOrange' | 'fillSky'
> = ['fillViolet', 'fillTeal', 'fillLime', 'fillOrange', 'fillSky'];

const makeStyles = (p: Palette) => ({
  root: {
    alignSelf: 'flex-start' as const,
    gap: 4,
  },
  word: {
    color: p.text,
    fontFamily: fonts.displayBold,
    lineHeight: 16,
  },
  wordAccent: {
    color: p.fillTeal,
  },
  under: {
    alignItems: 'flex-end' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 3,
  },
  square: {
    borderRadius: 1.5,
  },
  tag: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 10,
    marginBottom: -2,
  },
});

// BrandMark renders the stacked Wavelength lockup: the docs-style two-tone
// wordmark over the five-square cluster, with a small lowercase demo tag
// right-aligned on the cluster's line. Stacking keeps the top bar narrow
// while carrying the full brand. The teal falls on "Wave", matching the docs
// header and the social share cards. It is the bright brand teal rather than
// the darkened text value: WCAG exempts brand names from the contrast
// minimum, and matching the docs header exactly is the point.
export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const dimension = size === 'sm' ? 4 : 6;

  return (
    <View style={styles.root}>
      <Text style={[styles.word, { fontSize: size === 'sm' ? 14 : 15 }]}>
        <Text style={styles.wordAccent}>Wave</Text>
        length
      </Text>
      <View style={styles.under}>
        <View style={styles.row}>
          {CLUSTER.map((tone) => (
            <View
              key={tone}
              style={[
                styles.square,
                {
                  backgroundColor: palette[tone],
                  height: dimension,
                  width: dimension,
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.tag}>demo</Text>
      </View>
    </View>
  );
}
