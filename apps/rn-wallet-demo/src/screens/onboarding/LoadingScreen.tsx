import { Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { PrimaryButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { InlineError } from '../../components/ui/InlineError';
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
  errorBox: {
    gap: 12,
  },
  retry: {
    marginTop: 20,
  },
});

// LoadingScreen is the boot/transition splash shown while the runtime starts,
// stops, or a passkey ceremony holds the screen. The wallet phase normally
// advances it automatically, but the runtime start and stop phases can fail
// without changing phase, so an optional error + onRetry turns the otherwise
// endless spinner into a message with a retry.
export function LoadingScreen({
  network,
  title,
  sub,
  error,
  onRetry,
}: {
  network: string;
  title: string;
  sub: string;
  error?: string;
  onRetry?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const failed = Boolean(error);

  return (
    <AuthLayout network={network}>
      <AuthHeader title={title} sub={sub} />
      <Card style={styles.card}>
        {failed ? (
          <View style={styles.errorBox}>
            <InlineError message={error ?? ''} />
          </View>
        ) : (
          <View style={styles.row}>
            <Spinner />
            <Text style={styles.text}>{sub}</Text>
          </View>
        )}
      </Card>
      {failed && onRetry ? (
        <View style={styles.retry}>
          <PrimaryButton icon={RefreshCw} onPress={onRetry}>
            Try again
          </PrimaryButton>
        </View>
      ) : null}
    </AuthLayout>
  );
}
