import { Text, View } from 'react-native';
import type { WalletDKLogPayload } from '@lightninglabs/walletdk-react';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { formatSats } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  card: {
    padding: 24,
  },
  tipRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  tipLabel: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  tipValue: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  spinnerRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 12,
  },
  spinnerText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  logBox: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    gap: 8,
    marginTop: 20,
    padding: 12,
  },
  logLine: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  logLevel: {
    color: p.faint,
  },
});

// SyncingScreen serves the `syncing` phase: the wallet exists and is scanning
// the chain. Progress is indeterminate; it advances once the wallet reports
// ready. The latest runtime log lines give a sense of motion.
export function SyncingScreen({
  network,
  blockHeight,
  logs,
}: {
  network: string;
  blockHeight?: number;
  logs: WalletDKLogPayload[];
}) {
  const styles = useThemedStyles(makeStyles);
  const recent = logs.slice(-4).reverse();

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Syncing"
        sub="Scanning the chain and rebuilding wallet state."
      />
      <Card style={styles.card}>
        {blockHeight ? (
          <View style={styles.tipRow}>
            <Text style={styles.tipLabel}>Chain tip</Text>
            <Text style={styles.tipValue}>block {formatSats(blockHeight)}</Text>
          </View>
        ) : null}
        <View style={styles.spinnerRow}>
          <Spinner size={16} />
          <Text style={styles.spinnerText}>Syncing…</Text>
        </View>
        {recent.length > 0 ? (
          <View style={styles.logBox}>
            {recent.map((log, i) => (
              <Text key={`${i}-${log.message}`} style={styles.logLine} numberOfLines={1}>
                <Text style={styles.logLevel}>{log.level} </Text>
                {log.message}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </AuthLayout>
  );
}
