import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  button: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  done: {
    color: p.good,
  },
});

// CopyButton writes a value to the clipboard and shows a transient "Copied"
// confirmation. It only confirms after the write resolves, so a failed copy
// never shows a false positive.
export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      setDone(true);
      timer.current = setTimeout(() => setDone(false), 1400);
    } catch {
      // Leave the button in its default state on failure.
    }
  };

  return (
    <Pressable onPress={copy} style={styles.button} hitSlop={6}>
      {done ? (
        <Check size={13} color={palette.good} />
      ) : (
        <Copy size={13} color={palette.muted} />
      )}
      <Text style={[styles.text, done && styles.done]}>
        {done ? 'Copied' : label}
      </Text>
    </Pressable>
  );
}
