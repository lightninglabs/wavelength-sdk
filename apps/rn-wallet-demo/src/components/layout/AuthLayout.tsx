import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bitcoin } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ThemeToggle } from '../ui/ThemeToggle';

const makeStyles = (p: Palette) => ({
  root: {
    backgroundColor: p.bg,
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 28,
  },
  brand: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  brandTile: {
    alignItems: 'center' as const,
    backgroundColor: p.accent,
    height: 32,
    justifyContent: 'center' as const,
    width: 32,
  },
  brandName: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  brandSub: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
});

// AuthLayout frames every pre-auth screen: a scrollable, keyboard-avoiding
// single column with a compact brand header (wordmark + network) and a theme
// toggle, replacing the web demo's desktop side panel.
export function AuthLayout({
  children,
  network,
}: {
  children: ReactNode;
  network: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.brandTile}>
                <Bitcoin size={17} color="#ffffff" />
              </View>
              <View>
                <Text style={styles.brandName}>Wavelength Demo</Text>
                <Text style={styles.brandSub}>{network} · self-custody</Text>
              </View>
            </View>
            <ThemeToggle />
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
