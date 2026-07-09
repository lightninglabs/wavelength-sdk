import { ReactNode } from 'react';
import { View } from 'react-native';
import { Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppTab } from './nav';
import { BottomTabs } from './BottomTabs';
import { TopBar } from './TopBar';

const makeStyles = (p: Palette) => ({
  root: {
    backgroundColor: p.bg,
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

// AppShell is the authenticated app frame: top bar, the routed screen, and
// the bottom tab bar. Each screen owns its own scrolling. network is the
// connect form's chosen network, passed through to TopBar as a fallback
// label until the wallet's own info reports one.
export function AppShell({
  tab,
  onTab,
  network,
  children,
}: {
  tab: AppTab;
  onTab: (tab: AppTab) => void;
  network: string;
  children: ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.root}>
      <TopBar network={network} />
      <View style={styles.content}>{children}</View>
      <BottomTabs tab={tab} onTab={onTab} />
    </View>
  );
}
