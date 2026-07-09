import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WalletDKProvider } from '@lightninglabs/walletdk-react';
import { createNativeWalletEngine } from '@lightninglabs/walletdk-react-native';
import { passkeyCeremony } from './src/lib/passkeyCeremony';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { WalletApp } from './src/WalletApp';

// The engine is built once here and injected into the provider, which is
// transport-agnostic.
const engine = createNativeWalletEngine();

// Warm the memoized passkey support probe now, before onboarding ever
// mounts, so its result is already resolved by the time a screen reads it.
void passkeyCeremony.supportsPasskeyPrf();

// Themed mounts inside ThemeProvider so the status bar tracks the palette.
function Themed() {
  const { theme } = useTheme();

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <WalletApp />
    </>
  );
}

export default function App() {
  // Hold rendering until the IBM Plex families are ready so text never
  // flashes in the system font.
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <WalletDKProvider engine={engine}>
          <Themed />
        </WalletDKProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
