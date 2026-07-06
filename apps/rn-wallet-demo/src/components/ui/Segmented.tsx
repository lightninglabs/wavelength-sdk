import { Pressable, Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  group: {
    alignSelf: 'flex-start' as const,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
  },
  segment: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  segmentSm: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  divider: {
    borderColor: p.border,
    borderLeftWidth: 1,
  },
  on: {
    backgroundColor: p.well,
  },
  text: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    textTransform: 'capitalize' as const,
  },
  textSm: {
    fontSize: 12,
  },
  textOn: {
    color: p.text,
  },
});

// Segmented is a single-select group used for the network, receive method,
// word-count, and theme toggles.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.group}>
      {options.map((o, i) => {
        const on = value === o.value;

        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              size === 'sm' && styles.segmentSm,
              i > 0 && styles.divider,
              on && styles.on,
            ]}
          >
            <Text
              style={[styles.text, size === 'sm' && styles.textSm, on && styles.textOn]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
