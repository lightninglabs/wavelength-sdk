import { Pressable, Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { RuntimeNetwork } from '../../lib/runtime-config';

// Each network carries one hue from the five-square brand cluster
// (BrandMark) plus a one-line descriptor of where its servers live, matching
// the web demo's NetworkPicker verbatim.
const NETWORK_META: Record<
  RuntimeNetwork,
  { tone: 'fillViolet' | 'fillSky' | 'fillOrange'; blurb: string }
> = {
  signet: { tone: 'fillViolet', blurb: 'Recommended for trying the demo' },
  testnet: { tone: 'fillSky', blurb: 'The public Bitcoin testnet3' },
  regtest: { tone: 'fillOrange', blurb: 'Your local dev stack' },
};

const makeStyles = (p: Palette) => ({
  group: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  option: {
    borderWidth: 1,
    flexBasis: 132,
    flexGrow: 1,
    gap: 8,
    padding: 14,
  },
  optionOff: {
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
  },
  optionOn: {
    backgroundColor: p.accentSoft,
    borderColor: p.accent,
  },
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  tone: {
    borderRadius: 1.5,
    height: 6,
    width: 6,
  },
  label: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    textTransform: 'capitalize' as const,
  },
  blurb: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
  },
  radio: {
    borderRadius: 6,
    borderWidth: 2,
    height: 11,
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

// NetworkPicker is the network selector on the wallet setup and legacy
// choose-network screens: one tile per network, in the same card idiom as
// WalletTypePicker (accent border plus radio dot when selected). The
// accessible label is pinned to the bare network value because the manual
// checklist selects by it; the visible label is capitalized separately.
export function NetworkPicker({
  value,
  options,
  onChange,
}: {
  value: RuntimeNetwork;
  options: ReadonlyArray<RuntimeNetwork>;
  onChange: (next: RuntimeNetwork) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.group} accessibilityRole="radiogroup">
      {options.map((network) => {
        const selected = value === network;
        const meta = NETWORK_META[network];

        return (
          <Pressable
            key={network}
            accessibilityRole="radio"
            accessibilityLabel={network}
            accessibilityState={{ selected }}
            onPress={() => onChange(network)}
            style={[styles.option, selected ? styles.optionOn : styles.optionOff]}
          >
            <View style={styles.head}>
              <View style={[styles.tone, { backgroundColor: palette[meta.tone] }]} />
              <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]} />
            </View>
            <View>
              <Text style={styles.label}>{network}</Text>
              <Text style={styles.blurb}>{meta.blurb}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
