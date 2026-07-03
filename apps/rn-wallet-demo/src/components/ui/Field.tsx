import { Text, TextInput, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  wrap: {
    gap: 8,
  },
  label: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  input: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  disabled: {
    color: p.muted,
  },
});

// Field is a labelled input matched to the recessed well surface.
export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  mono = false,
  numeric = false,
  disabled = false,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  secure?: boolean;
  mono?: boolean;
  numeric?: boolean;
  disabled?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        secureTextEntry={secure}
        keyboardType={numeric ? 'numeric' : 'default'}
        editable={!disabled}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[styles.input, mono && styles.mono, disabled && styles.disabled]}
      />
    </View>
  );
}
