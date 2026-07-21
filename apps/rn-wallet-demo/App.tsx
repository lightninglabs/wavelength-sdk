// Import each weight from its own subpath. The root package entry point
// `require()`s every generated weight, so importing from it makes Metro bundle
// all 52 typeface files instead of the eight this app registers below.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { WorkSans_600SemiBold } from '@expo-google-fonts/work-sans/600SemiBold';
import { WorkSans_700Bold } from '@expo-google-fonts/work-sans/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WavelengthProvider } from '@lightninglabs/wavelength-react';
import { createNativeWalletEngine } from '@lightninglabs/wavelength-react-native';
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
  // Hold rendering until the Inter, Work Sans and JetBrains Mono families
  // are ready so text never flashes in the system font. A load failure falls
  // through to the system font instead of blocking: a missing typeface is a
  // cosmetic problem, and returning null on it would strand the user on a
  // blank screen with no way forward.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  if (fontError) {
    console.warn('Font loading failed, falling back to system fonts', fontError);
  }

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <WavelengthProvider engine={engine}>
          <Themed />
        </WavelengthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
