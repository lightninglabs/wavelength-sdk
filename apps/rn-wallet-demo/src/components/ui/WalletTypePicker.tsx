import { Pressable, Text, View } from 'react-native';
import { Fingerprint, KeyRound, type LucideIcon } from 'lucide-react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

export type WalletMode = 'passkey' | 'password';

type WalletTypeOption = {
  value: WalletMode;
  label: string;
  description: string;
  icon: LucideIcon;
};

const OPTIONS: ReadonlyArray<WalletTypeOption> = [
  {
    value: 'passkey',
    label: 'Passkey',
    description:
      'Unlock with your fingerprint, face, or device PIN. Syncs across devices.',
    icon: Fingerprint,
  },
  {
    value: 'password',
    label: 'Password',
    description:
      'Choose a password you remember. Works on every device.',
    icon: KeyRound,
  },
];

const makeStyles = (p: Palette) => ({
  group: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  option: {
    borderWidth: 1,
    // Each card takes an equal half of the row; row align-stretch keeps the two
    // the same height when their descriptions wrap to different line counts.
    flex: 1,
    gap: 12,
    padding: 16,
  },
  optionOff: {
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
  },
  optionOn: {
    backgroundColor: p.accentSoft,
    borderColor: p.accent,
  },
  iconBox: {
    alignItems: 'center' as const,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center' as const,
    width: 40,
  },
  iconBoxOff: {
    backgroundColor: p.well,
    borderColor: p.border,
  },
  iconBoxOn: {
    backgroundColor: p.surface,
    borderColor: p.accent,
  },
  label: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  description: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  radio: {
    borderRadius: 6,
    borderWidth: 2,
    height: 11,
    position: 'absolute' as const,
    right: 12,
    top: 12,
    width: 11,
  },
  radioOff: {
    borderColor: p.borderStrong,
  },
  radioOn: {
    backgroundColor: p.accent,
    borderColor: p.accent,
  },
});

// WalletTypePicker is a prominent two-option selector for passkey vs password
// wallet creation, laid out as a two-column row like the web demo.
export function WalletTypePicker({
  value,
  onChange,
}: {
  value: WalletMode;
  onChange: (next: WalletMode) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected ? styles.optionOn : styles.optionOff]}
          >
            <View
              style={[styles.iconBox, selected ? styles.iconBoxOn : styles.iconBoxOff]}
            >
              <Icon
                size={20}
                color={selected ? palette.accent : palette.muted}
                strokeWidth={1.75}
              />
            </View>
            <View>
              <Text style={styles.label}>{option.label}</Text>
              <Text style={styles.description}>{option.description}</Text>
            </View>
            <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]} />
          </Pressable>
        );
      })}
    </View>
  );
}
