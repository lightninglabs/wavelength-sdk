import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import type { ExitJobStatus } from '@lightninglabs/wavelength-react';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// LABELS maps each job phase to its short wallet-facing label.
const LABELS: Record<ExitJobStatus, string> = {
  unspecified: 'Unknown',
  pending: 'Pending',
  materializing: 'Materializing',
  csv_pending: 'Timelock',
  sweeping: 'Sweeping',
  completed: 'Completed',
  failed: 'Failed',
};

// tone maps each phase to a semantic colour treatment. The four in-flight
// phases share the accent tone (work is happening), a finished exit reads
// "good", a failed one "bad", and an unknown phase stays neutral.
function tone(p: Palette, status: ExitJobStatus): { bg: string; fg: string } {
  switch (status) {
    case 'completed':
      return { bg: p.goodSoft, fg: p.good };
    case 'failed':
      return { bg: p.badSoft, fg: p.bad };
    case 'unspecified':
      return { bg: p.well, fg: p.muted };
    default:
      return { bg: p.accentSoft, fg: p.accent };
  }
}

// IN_FLIGHT phases animate their status dot so an in-progress exit reads as
// live at a glance.
const IN_FLIGHT: ReadonlySet<ExitJobStatus> = new Set([
  'pending',
  'materializing',
  'csv_pending',
  'sweeping',
]);

const makeStyles = (p: Palette) => ({
  chip: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
});

// PulseDot renders the chip's status marker, fading in and out while an exit is
// in flight so a live phase reads as active. A settled phase shows a steady dot.
function PulseDot({ color, live }: { color: string; live: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!live) {
      opacity.setValue(1);

      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [live, opacity]);

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color, opacity }]}
    />
  );
}

// PhaseChip renders an exit's job phase as a compact status pill, deriving its
// tone from the phase. `detail` (the daemon's one-line phase description) is
// surfaced to assistive tech.
export function PhaseChip({
  status,
  detail,
}: {
  status: ExitJobStatus;
  detail?: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { bg, fg } = tone(palette, status);

  return (
    <View
      style={[styles.chip, { backgroundColor: bg }]}
      accessibilityLabel={detail ?? LABELS[status]}
      testID="exit-phase-chip"
    >
      <PulseDot color={fg} live={IN_FLIGHT.has(status)} />
      <Text style={[styles.label, { color: fg }]}>{LABELS[status]}</Text>
    </View>
  );
}
