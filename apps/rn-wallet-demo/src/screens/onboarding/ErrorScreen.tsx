import { Text, View } from 'react-native';
import { RefreshCw, TriangleAlert } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { WipeDataButton } from '../../components/WipeDataButton';
import { PrimaryButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  card: {
    padding: 24,
  },
  row: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  iconBox: {
    alignItems: 'center' as const,
    backgroundColor: p.badSoft,
    borderColor: p.bad,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center' as const,
    width: 40,
  },
  message: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  retry: {
    marginTop: 20,
  },
});

// ErrorScreen serves the `error` phase: the runtime failed to initialise or
// start. It surfaces the message and offers a retry, plus the wipe escape
// hatch for when stored data (a stale database, say) is what keeps the
// runtime from starting.
export function ErrorScreen({
  network,
  message,
  onRetry,
  onWipe,
  busy,
}: {
  network: string;
  message: string;
  onRetry: () => void;
  onWipe: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Runtime error"
        sub="Something went wrong starting the wallet runtime."
      />
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <TriangleAlert size={18} color={palette.bad} />
          </View>
          <Text style={styles.message}>{message || 'Unknown error.'}</Text>
        </View>
      </Card>
      <View style={styles.retry}>
        <PrimaryButton icon={RefreshCw} onPress={onRetry} disabled={busy} busy={busy}>
          {busy ? 'Retrying…' : 'Try again'}
        </PrimaryButton>
        <WipeDataButton onWipe={onWipe} />
      </View>
    </AuthLayout>
  );
}
