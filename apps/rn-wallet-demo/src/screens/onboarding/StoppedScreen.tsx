import { Text, View } from 'react-native';
import { Power } from 'lucide-react-native';
import { useWalletInfo } from '@lightninglabs/wavelength-react';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
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
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  iconBox: {
    alignItems: 'center' as const,
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center' as const,
    width: 44,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  meta: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  hint: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center' as const,
  },
  start: {
    marginTop: 20,
  },
});

// StoppedScreen serves the `stopped` phase: the runtime was torn down and its
// in-memory keys cleared. Starting again re-runs the connect flow. The last
// known block height and version are self-served from the provider (the
// engine keeps the most recent info around after a stop).
export function StoppedScreen({
  network,
  onStart,
  busy,
}: {
  network: string;
  onStart: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const info = useWalletInfo();
  const meta = [
    info?.blockHeight ? `last block ${info.blockHeight}` : '',
    info?.version ? `v${info.version}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Runtime stopped"
        sub={`The runtime was torn down. Start it again to reconnect to the ${network} servers.`}
      />
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Power size={20} color={palette.muted} />
          </View>
          <View>
            <Text style={styles.title}>In-memory keys cleared</Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          </View>
        </View>
      </Card>
      <View style={styles.start}>
        <PrimaryButton icon={Power} onPress={onStart} disabled={busy} busy={busy}>
          {busy ? 'Starting runtime…' : 'Start runtime'}
        </PrimaryButton>
      </View>
      <Text style={styles.hint}>
        You will need your password or passkey to unlock again.
      </Text>
    </AuthLayout>
  );
}
