import { Pressable } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { Palette } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  button: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
});

// ThemeToggle is a compact icon button that flips between light and dark.
export function ThemeToggle() {
  const { theme, palette, toggleTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      onPress={toggleTheme}
      style={styles.button}
      accessibilityLabel="Toggle color theme"
    >
      {theme === 'dark' ? (
        <Sun size={16} color={palette.muted} />
      ) : (
        <Moon size={16} color={palette.muted} />
      )}
    </Pressable>
  );
}
