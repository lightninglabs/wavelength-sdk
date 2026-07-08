import { Pressable, View } from 'react-native';
import { Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  track: {
    height: 22,
    padding: 3,
    width: 44,
  },
  trackOn: {
    backgroundColor: p.accent,
  },
  trackOff: {
    backgroundColor: p.borderStrong,
  },
  knob: {
    backgroundColor: '#ffffff',
    height: 16,
    width: 16,
  },
  knobOn: {
    alignSelf: 'flex-end' as const,
  },
  disabled: {
    opacity: 0.6,
  },
});

// Toggle is the Zones square switch: a sharp-cornered 2:1 track with a square
// knob, matching the squared language of the rest of the UI.
export function Toggle({
  on,
  onChange,
  accessibilityLabel,
  disabled = false,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      onPress={() => onChange(!on)}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      style={[
        styles.track,
        on ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}
