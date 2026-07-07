import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type {
  CreateWalletResult,
  RecoveryState,
} from '@lightninglabs/walletdk-react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react-native';
import { Palette, fonts } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Spinner } from './ui/Spinner';

// summarizeRecovered turns the recovery counters into a short human summary of
// what came back, e.g. "3 VTXOs, 1 boarding output".
function summarizeRecovered(result: CreateWalletResult): string {
  const parts: string[] = [];
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  if (result.recoveredVTXOs > 0) {
    parts.push(plural(result.recoveredVTXOs, 'VTXO'));
  }
  if (result.recoveredBoardingUTXOs > 0) {
    parts.push(plural(result.recoveredBoardingUTXOs, 'boarding output'));
  }

  return parts.join(', ');
}

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  restoring: { backgroundColor: p.accentSoft },
  done: { backgroundColor: p.goodSoft },
  failed: { backgroundColor: p.badSoft },
  text: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
});

// RecoveryBanner surfaces the background wallet-recovery status above the main
// wallet UI. Recovery runs while the wallet is already usable, so the banner
// explains that balances and history are still filling in, and reports the
// outcome once the daemon's indexer scan finishes.
export function RecoveryBanner({
  recovery,
  onDismiss,
}: {
  recovery: RecoveryState;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Auto-clear the success banner after a short read; leave the failure banner
  // up until the user dismisses it.
  useEffect(() => {
    if (recovery.status !== 'done') {
      return;
    }

    const id = setTimeout(onDismiss, 8000);

    return () => clearTimeout(id);
  }, [recovery.status, onDismiss]);

  if (recovery.status === 'idle') {
    return null;
  }

  if (recovery.status === 'restoring') {
    return (
      <View style={[styles.row, styles.restoring]}>
        <Spinner size={16} />
        <Text style={styles.text}>
          Restoring your balance and history. This can take a few minutes; your
          balance will fill in as it is found.
        </Text>
      </View>
    );
  }

  if (recovery.status === 'done') {
    const summary = summarizeRecovered(recovery.result);

    return (
      <View style={[styles.row, styles.done]}>
        <CheckCircle2 size={16} color={palette.good} />
        <Text style={styles.text}>
          {summary
            ? `Wallet restored. Recovered ${summary}.`
            : 'Wallet restored. No prior balance or history was found.'}
        </Text>
        <DismissButton onPress={onDismiss} color={palette.muted} />
      </View>
    );
  }

  // status === 'failed'
  return (
    <View style={[styles.row, styles.failed]}>
      <TriangleAlert size={16} color={palette.bad} />
      <Text style={styles.text}>
        Could not finish restoring your history, so your balance may be
        incomplete. The wallet is still usable.
      </Text>
      <DismissButton onPress={onDismiss} color={palette.muted} />
    </View>
  );
}

function DismissButton({
  onPress,
  color,
}: {
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel="Dismiss" hitSlop={8}>
      <X size={16} color={color} />
    </Pressable>
  );
}
