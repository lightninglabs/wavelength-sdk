import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Landmark } from 'lucide-react-native';
import {
  Balance,
  useWalletDeposit,
  useWalletSweep,
} from '@lightninglabs/wavelength-react';
import { formatSats } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderTopWidth: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 20,
    paddingTop: 16,
  },
  label: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  labelText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  labelHint: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  value: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
});

// OnChainBalance surfaces the backing wallet's confirmed on-chain balance, which
// is NOT part of the SDK Balance snapshot (that only covers Ark VTXO value).
// Cooperative-leave funds land here, so the Overview needs a way to show it.
//
// It reads the total by PREVIEWING a wallet sweep (broadcast:false moves no
// money) to a destination address minted once and cached: the preview needs a
// valid address but never sends. This is a best-effort, preview-call-as-balance
// -read (the clean fix is a real on-chain balance on the SDK facade). If the
// preview throws or finds no inputs, the line hides rather than showing an
// error, and it re-reads on each balance refresh.
export function OnChainBalance({ balance }: { balance: Balance | null }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { deposit } = useWalletDeposit();
  const { sweep } = useWalletSweep();
  const addressRef = useRef('');
  const [onchainSat, setOnchainSat] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        // Mint one address and cache it, so a refresh reuses the same preview
        // destination instead of minting on every render.
        if (!addressRef.current) {
          addressRef.current = (await deposit()).address;
        }
        const result = await sweep({
          destinationAddress: addressRef.current,
          broadcast: false,
        });
        if (cancelled) {
          return;
        }
        // Hide the line when the backing wallet has nothing on-chain to sweep.
        const hasInputs = (result.inputs?.length ?? 0) > 0;
        setOnchainSat(hasInputs ? result.totalInputSat : null);
      } catch (err) {
        // Best-effort surface: on any failure, hide silently.
        console.warn("on-chain balance preview failed:", err);
        if (!cancelled) {
          setOnchainSat(null);
        }
      }
    };

    void read();

    return () => {
      cancelled = true;
    };
    // Re-read on each balance refresh: the snapshot object changes per refresh.
  }, [balance, deposit, sweep]);

  if (onchainSat === null) {
    return null;
  }

  return (
    <View style={styles.row} testID="onchain-balance">
      <View style={styles.label}>
        <Landmark size={14} color={palette.muted} />
        <Text style={styles.labelText}>On-chain wallet</Text>
        <Text style={styles.labelHint}>backing balance</Text>
      </View>
      <Text style={styles.value}>{formatSats(onchainSat)} sats</Text>
    </View>
  );
}
