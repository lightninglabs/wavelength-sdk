import { ActivityIndicator } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

// Spinner is an accent-tinted loading indicator.
export function Spinner({ size = 18, color }: { size?: number; color?: string }) {
  const { palette } = useTheme();

  return <ActivityIndicator size={size} color={color ?? palette.accent} />;
}
