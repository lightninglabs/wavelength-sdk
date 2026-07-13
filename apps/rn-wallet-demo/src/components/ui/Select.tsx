import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
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
  control: {
    alignItems: 'center' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  value: {
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  valueDisabled: {
    color: p.muted,
  },
  backdrop: {
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flex: 1,
    justifyContent: 'center' as const,
    padding: 16,
  },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    maxWidth: 384,
    paddingVertical: 8,
    width: '100%' as const,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionSelected: {
    backgroundColor: p.accentSoft,
  },
  optionText: {
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  optionTextSelected: {
    color: p.accent,
    fontFamily: fonts.sansSemiBold,
  },
});

// Select is a labelled single-choice picker matched to the recessed well
// surface: a pressable field that opens a modal option list, since native
// has no select element.
export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.control}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.value, disabled && styles.valueDisabled]}>
          {value}
        </Text>
        <ChevronDown size={16} color={palette.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => undefined}>
            {options.map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.option,
                  option === value && styles.optionSelected,
                ]}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    option === value && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
