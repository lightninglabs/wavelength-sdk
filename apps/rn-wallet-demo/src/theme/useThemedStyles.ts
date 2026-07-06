import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Palette } from './tokens';
import { useTheme } from './ThemeProvider';

// useThemedStyles memoizes a StyleSheet built from the active palette. The
// maker function MUST be a module-level constant (not an inline closure) so
// the memo only re-runs on theme flips.
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  make: (palette: Palette) => T,
): T {
  const { palette } = useTheme();

  return useMemo(() => StyleSheet.create(make(palette)), [make, palette]);
}
