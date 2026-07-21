import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWallet, useWalletInfo } from '@lightninglabs/wavelength-react';
import { phaseConnected, statusLabel } from '../../lib/phase';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { BrandMark } from '../ui/BrandMark';
import { ThemeToggle } from '../ui/ThemeToggle';

const makeStyles = (p: Palette) => ({
  bar: {
    backgroundColor: p.bg,
    borderBottomWidth: 1,
    borderColor: p.border,
  },
  inner: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    height: 56,
    paddingHorizontal: 16,
  },
  brand: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  status: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    marginLeft: 'auto' as const,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  statusText: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  dotSep: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
});

// TopBar is the authenticated app's compact header: brand on the left, the
// live connection dot, phase, and network on the right, plus the theme
// toggle. The status self-serves the wallet's phase and info; network is the
// connect form's chosen network, used only as a fallback label until the
// wallet's own info reports one.
export function TopBar({ network }: { network: string }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { phase } = useWallet();
  const info = useWalletInfo();
  const status = {
    phaseLabel: statusLabel(phase),
    network: info?.network || network,
    connected: phaseConnected(phase),
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <View style={styles.brand}>
          <BrandMark />
        </View>
        <View style={styles.status}>
          <View
            style={[
              styles.dot,
              { backgroundColor: status.connected ? palette.good : palette.bad },
            ]}
          />
          <Text style={styles.statusText}>{status.phaseLabel}</Text>
          <Text style={styles.dotSep}>·</Text>
          <Text style={styles.statusText}>{status.network}</Text>
          <ThemeToggle />
        </View>
      </View>
    </View>
  );
}
