import { Pressable, Text, View } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useWalletExitStatus } from '@lightninglabs/wavelength-react';
import { formatSats } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { InlineError } from '../ui/InlineError';
import { Spinner } from '../ui/Spinner';
import { SummaryRow } from '../ui/SummaryRow';
import { PhaseChip } from './PhaseChip';

const makeStyles = (p: Palette) => ({
  empty: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    marginTop: 12,
  },
  panel: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
  },
  refresh: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
  },
  refreshText: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  rows: {
    gap: 10,
    marginTop: 14,
  },
  error: {
    marginTop: 14,
  },
});

// ExitStatusPanel shows one exit's live detail: its phase, recovery-tree
// progress, timelock countdown, fee/recovery breakdown, and any terminal
// error. It polls in the foreground so the numbers stay current while the
// screen is open.
export function ExitStatusPanel({ outpoint }: { outpoint: string }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { status, refreshStatus, statusPending } = useWalletExitStatus(
    outpoint,
    { detailed: true, pollMs: 15000 },
  );

  if (!status?.found) {
    return (
      <Text style={styles.empty} testID="exit-status-empty">
        No exit in progress.
      </Text>
    );
  }

  return (
    <View style={styles.panel} testID="exit-status-panel">
      <View style={styles.head}>
        <PhaseChip status={status.status} detail={status.phaseDetail} />
        <Pressable
          onPress={() => void refreshStatus()}
          disabled={statusPending}
          style={styles.refresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {statusPending ? (
            <Spinner size={12} color={palette.muted} />
          ) : (
            <RefreshCw size={12} color={palette.muted} />
          )}
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.rows}>
        {status.progress ? (
          <SummaryRow
            label="Recovery tree"
            value={`layer ${status.progress.currentLayer} of ${status.progress.totalLayers}, ${status.progress.confirmedTxs}/${status.progress.totalTxs} txs`}
          />
        ) : null}
        {status.cSV ? (
          <SummaryRow
            label="Timelock"
            value={
              status.cSV.mature
                ? 'mature'
                : `${status.cSV.blocksRemaining} blocks left`
            }
          />
        ) : null}
        {status.fees ? (
          <>
            <SummaryRow
              label="Total cost"
              value={`${formatSats(status.fees.totalCostSat)} sats`}
              mono
            />
            <SummaryRow
              label="Net recovered"
              value={`${formatSats(status.fees.netRecoveredSat)} sats`}
              mono
            />
          </>
        ) : null}
      </View>

      {status.status === 'failed' ? (
        <View style={styles.error}>
          <InlineError message={status.lastError} />
        </View>
      ) : null}
    </View>
  );
}
