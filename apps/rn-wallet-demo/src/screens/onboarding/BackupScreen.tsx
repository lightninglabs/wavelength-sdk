import { Text, View } from 'react-native';
import { Check, TriangleAlert } from 'lucide-react-native';
import { useWalletRefresh } from '@lightninglabs/wavelength-react';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { PrimaryButton } from '../../components/ui/Button';
import { CopyButton } from '../../components/ui/CopyButton';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  warning: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.warnSoft,
    borderColor: p.warn,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 20,
    padding: 12,
  },
  warningText: {
    color: p.warn,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  wordBox: {
    alignItems: 'center' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexBasis: '48%' as const,
    flexDirection: 'row' as const,
    flexGrow: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  wordIndex: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  word: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  actions: {
    gap: 12,
    marginTop: 20,
  },
  copyRow: {
    alignItems: 'center' as const,
  },
});

// BackupScreen serves a freshly created wallet (phase ready, backup not yet
// acknowledged): it presents the generated recovery phrase once before the
// dashboard becomes reachable. Acknowledging fires a background refresh so
// the dashboard it hands off to is not stale.
export function BackupScreen({
  network,
  mnemonic,
  onAcknowledge,
}: {
  network: string;
  mnemonic: string[];
  onAcknowledge: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { refresh, refreshPending } = useWalletRefresh();

  function handleAcknowledge() {
    onAcknowledge();
    void refresh().catch(() => undefined);
  }

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Recovery phrase"
        sub={`Write down these ${mnemonic.length} words in order and store them offline.`}
      />
      <View style={styles.warning}>
        <TriangleAlert size={14} color={palette.warn} style={{ marginTop: 2 }} />
        <Text style={styles.warningText}>
          Anyone with this phrase can spend your funds. Never share it.
        </Text>
      </View>
      <View style={styles.grid}>
        {mnemonic.map((word, i) => (
          <View key={`${i}-${word}`} style={styles.wordBox}>
            <Text style={styles.wordIndex}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.word}>{word}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <View style={styles.copyRow}>
          <CopyButton value={mnemonic.join(' ')} label="Copy phrase" />
        </View>
        <PrimaryButton icon={Check} onPress={handleAcknowledge} disabled={refreshPending} busy={refreshPending}>
          I saved it
        </PrimaryButton>
      </View>
    </AuthLayout>
  );
}
