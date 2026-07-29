import { useState } from 'react';
import { Text, View } from 'react-native';
import { RotateCcw, TriangleAlert } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  card: {
    flexDirection: 'row' as const,
    gap: 12,
    padding: 20,
  },
  iconBox: {
    alignItems: 'center' as const,
    borderColor: p.warn,
    borderWidth: 1,
    backgroundColor: p.warnSoft,
    height: 40,
    justifyContent: 'center' as const,
    width: 40,
  },
  body: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 12,
    marginTop: 20,
  },
});

// DataMissingScreen serves a registered wallet whose on-disk data is gone:
// the device cleared storage (a manual wipe, an OS eviction) out from under a
// wallet that is still listed in the registry. Both the registry entry and
// the on-disk data are independent stores, so this state is reachable
// without any single deletion path being at fault.
export function DataMissingScreen({
  walletName,
  network,
  onSetUpAgain,
  onRemove,
}: {
  walletName: string;
  network: string;
  onSetUpAgain: () => void;
  onRemove: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Wallet data missing"
        sub={`This device no longer holds "${walletName}"'s data, even though it is still listed.`}
      />
      <Card style={styles.card}>
        <View style={styles.iconBox}>
          <TriangleAlert size={18} color={palette.warn} />
        </View>
        <Text style={styles.body}>
          Its storage was cleared, most likely by the OS reclaiming space or a
          manual data wipe. Set it up again with your recovery phrase or
          passkey, or remove it from the list.
        </Text>
      </Card>

      <View style={styles.actions}>
        <PrimaryButton icon={RotateCcw} onPress={onSetUpAgain}>
          Set up again
        </PrimaryButton>
        <GhostButton onPress={() => setConfirmRemove(true)}>
          Remove wallet
        </GhostButton>
      </View>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this wallet?"
        description="This removes the wallet from this list only. There is no data left to reclaim; it is already gone from this device's storage."
        confirmLabel="Remove wallet"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </AuthLayout>
  );
}
