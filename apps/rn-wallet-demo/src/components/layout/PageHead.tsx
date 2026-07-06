import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

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
    fontFamily: fonts.sansSemiBold,
    fontSize: 18,
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
// the title block, and an optional trailing slot.
export function PageHead({
  title,
  subtitle,
  onBack,
  trailing,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Back">
          <ArrowLeft size={15} color={palette.muted} />
        </Pressable>
      ) : null}
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}
