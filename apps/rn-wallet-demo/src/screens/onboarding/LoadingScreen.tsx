import { Text, View } from 'react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  card: {
    padding: 24,
  },
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  text: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
});

// LoadingScreen is the boot/transition splash shown while the runtime starts,
// stops, or a passkey ceremony holds the screen. The wallet phase advances it
// automatically, and a failed start() now lands on its own 'error' phase (see
// ErrorScreen) instead of stranding the user here, so this screen carries no
// error affordance of its own.
export function LoadingScreen({
  network,
  title,
  sub,
}: {
  network: string;
  title: string;
  sub: string;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <AuthLayout network={network}>
      <AuthHeader title={title} sub={sub} />
      <Card style={styles.card}>
        <View style={styles.row}>
          <Spinner />
          <Text style={styles.text}>{sub}</Text>
        </View>
      </Card>
    </AuthLayout>
  );
}
