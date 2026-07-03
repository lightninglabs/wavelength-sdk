import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

type ButtonProps = {
  children: ReactNode;
  onPress?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  // block defaults to true (full-width). Pass false for an inline,
  // content-width button sitting inside a wide Band.
  block?: boolean;
};

const makeStyles = (p: Palette) => ({
  base: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: p.accent,
  },
  ghost: {
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
  },
  primaryText: {
    color: '#ffffff',
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  ghostText: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  linkText: {
    color: p.accent,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  block: {
    alignSelf: 'stretch' as const,
  },
  inline: {
    alignSelf: 'flex-start' as const,
  },
});

// ButtonIcon renders the leading glyph: a spinner while busy, otherwise the
// supplied icon (if any). A fixed 16px box keeps the label from shifting.
function ButtonIcon({
  icon: Icon,
  busy,
  color,
}: {
  icon?: LucideIcon;
  busy?: boolean;
  color: string;
}) {
  if (busy) {
    return <ActivityIndicator size={16} color={color} />;
  }

  return Icon ? <Icon size={16} color={color} /> : <View />;
}

// PrimaryButton is the single accent-filled call to action. When busy it
// shows a spinner and is non-interactive without changing its label.
export function PrimaryButton({
  children,
  onPress,
  icon,
  disabled = false,
  busy = false,
  block = true,
}: ButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const off = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[
        styles.base,
        styles.primary,
        block ? styles.block : styles.inline,
        off && styles.disabled,
      ]}
    >
      <ButtonIcon icon={icon} busy={busy} color="#ffffff" />
      <Text style={styles.primaryText}>{children}</Text>
    </Pressable>
  );
}

// GhostButton is a hairline-bordered secondary action.
export function GhostButton({
  children,
  onPress,
  icon,
  disabled = false,
  busy = false,
  block = true,
}: ButtonProps) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const off = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[
        styles.base,
        styles.ghost,
        block ? styles.block : styles.inline,
        off && styles.disabled,
      ]}
    >
      <ButtonIcon icon={icon} busy={busy} color={palette.text} />
      <Text style={styles.ghostText}>{children}</Text>
    </Pressable>
  );
}

// TextLink is the small accent action used to cross-link auth flows.
export function TextLink({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.linkText}>{children}</Text>
    </Pressable>
  );
}
