import { Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  wrap: {
    marginBottom: 24,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 20,
  },
  sub: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});

// AuthHeader is the heading block atop each onboarding form.
export function AuthHeader({ title, sub }: { title: string; sub: string }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </View>
  );
}
