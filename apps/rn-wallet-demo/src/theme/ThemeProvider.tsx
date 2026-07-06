import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Palette, ThemeName, palettes } from './tokens';

// The theme preference key. It deliberately survives a wallet-data wipe: it is
// a UI preference, not wallet data (the wipe flow deletes the data directory
// and clears only the wallet markers in walletKind.ts).
const STORAGE_KEY = 'walletdk-theme';

type ThemeContextValue = {
  theme: ThemeName;
  palette: Palette;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ThemeProvider owns the light/dark choice and persists it. An explicit saved
// choice wins, then the OS scheme, defaulting to dark (same resolution order
// as the web demo). Children render only after the stored value is read so
// the app never flashes the wrong palette.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(
      (stored) => {
        if (cancelled) {
          return;
        }
        if (stored === 'light' || stored === 'dark') {
          setThemeState(stored);
        } else {
          setThemeState(systemScheme === 'light' ? 'light' : 'dark');
        }
      },
      () => {
        if (!cancelled) {
          setThemeState(systemScheme === 'light' ? 'light' : 'dark');
        }
      },
    );

    return () => {
      cancelled = true;
    };
    // The system scheme only seeds the initial value; later OS flips do not
    // override an explicit in-session choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);

      return next;
    });
  }, []);

  if (theme === null) {
    return null;
  }

  return (
    <ThemeContext.Provider
      value={{ theme, palette: palettes[theme], setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// useTheme exposes the current theme, its palette, and the change controls.
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return value;
}
