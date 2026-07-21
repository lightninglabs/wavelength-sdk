import { Pressable, Text, View } from 'react-native';
import { Check, CircleCheck, RotateCcw } from 'lucide-react-native';
import type {
  ExitBatchEvent,
  ExitBatchResult,
  ExitBatchStop,
} from '@lightninglabs/wavelength-react';
import { Band } from '../ui/Band';
import { InlineError } from '../ui/InlineError';
import { Label } from '../ui/Label';
import { formatSats, shortKey } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

type ExitMode = 'cooperative' | 'unilateral';

// explainStop turns a batch stop into a human sentence. An infeasible stop is
// recoverable (top up the backing wallet and retry the rest); a rejection
// names the outpoint the daemon refused.
export function explainStop(stop: ExitBatchStop): string {
  if (stop.reason === 'infeasible') {
    return 'The backing wallet can no longer fund the remaining exits. Fund it and try the rest again.';
  }

  return `Exit for ${stop.outpoint} was rejected: ${stop.error.message}`;
}

// successMessage narrates what happens next once a batch resolves cleanly, so
// the tester knows where the funds go and how long it takes on each path.
function successMessage(
  mode: ExitMode,
  count: number,
  totalSat: number,
): string {
  const outputs = `${count} output${count === 1 ? '' : 's'}`;

  if (mode === 'cooperative') {
    return `Cooperative exit queued. Your ${outputs} (${formatSats(totalSat)} sats) will leave to the address you entered, or a new address in your on-chain wallet if you left it blank, when the next round settles (up to ~60s). It then appears in Activity and lands in your on-chain balance below.`;
  }

  return 'Unilateral exit started. It runs on-chain over roughly the next 12+ blocks (materialize, timelock, sweep). Track it in the banner and the status panel above; funds arrive in your on-chain balance when the sweep confirms.';
}

const makeStyles = (p: Palette) => ({
  rows: {
    gap: 8,
    marginTop: 16,
  },
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  check: {
    alignItems: 'center' as const,
    backgroundColor: p.goodSoft,
    height: 20,
    justifyContent: 'center' as const,
    width: 20,
  },
  started: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  outpoint: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  success: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.goodSoft,
    borderColor: p.good,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  successText: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  error: {
    marginTop: 16,
  },
  startAnother: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  startAnotherText: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
});

// ExitRunProgress narrates a batch run as it happens: one row per exit that has
// started, and, once the batch resolves, either a mode-aware success panel with
// a "Start another exit" reset or the reason it stopped.
export function ExitRunProgress({
  events,
  mode,
  data,
  totalSat,
  onStartAnother,
}: {
  events: readonly ExitBatchEvent[];
  mode: ExitMode;
  data: ExitBatchResult | null;
  totalSat: number;
  onStartAnother: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const started = events.filter((e) => e.type === 'started');
  const stopped = events.find((e) => e.type === 'stopped');
  const succeeded = data !== null && !data.stoppedBy;

  return (
    <Band tinted>
      <View testID="exit-run-progress">
        <Label accent="orange" rule>
          Exit progress
        </Label>
        <View style={styles.rows}>
          {started.map((e) => {
            const outpoint = (e as { outpoint: string }).outpoint;

            return (
              <View key={outpoint} style={styles.row}>
                <View style={styles.check}>
                  <Check size={12} strokeWidth={3} color={palette.good} />
                </View>
                <Text style={styles.started}>Started</Text>
                <Text style={styles.outpoint}>{shortKey(outpoint)}</Text>
              </View>
            );
          })}
        </View>
        {succeeded ? (
          <View style={styles.success} testID="exit-success">
            <CircleCheck
              size={16}
              color={palette.good}
              style={{ marginTop: 1 }}
            />
            <Text style={styles.successText}>
              {successMessage(mode, data.started.length, totalSat)}
            </Text>
          </View>
        ) : null}
        {stopped ? (
          <View style={styles.error}>
            <InlineError
              message={explainStop(
                (stopped as { stoppedBy: ExitBatchStop }).stoppedBy,
              )}
            />
          </View>
        ) : null}
        {data !== null ? (
          <Pressable
            testID="exit-start-another"
            onPress={onStartAnother}
            accessibilityRole="button"
            style={styles.startAnother}
          >
            <RotateCcw size={16} color={palette.text} />
            <Text style={styles.startAnotherText}>Start another exit</Text>
          </Pressable>
        ) : null}
      </View>
    </Band>
  );
}
