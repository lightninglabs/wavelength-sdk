import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowRight, LogOut, ShieldAlert } from 'lucide-react-native';
import {
  useWalletExitBatch,
  useWalletExitPlan,
  useWalletExits,
  useWalletList,
} from '@lightninglabs/wavelength-react';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { Field } from '../../components/ui/Field';
import { Label } from '../../components/ui/Label';
import { Segmented } from '../../components/ui/Segmented';
import { ExitAckDialog } from '../../components/exit/ExitAckDialog';
import { ExitPlanSummary } from '../../components/exit/ExitPlanSummary';
import { ExitRunProgress } from '../../components/exit/ExitRunProgress';
import { ExitStatusPanel } from '../../components/exit/ExitStatusPanel';
import { PhaseChip } from '../../components/exit/PhaseChip';
import { VTXOPicker } from '../../components/exit/VTXOPicker';
import { shortKey } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

type ExitMode = 'cooperative' | 'unilateral';

// MODE_HINT explains the trade-off behind each path so the choice is legible
// before the user commits.
const MODE_HINT: Record<ExitMode, string> = {
  cooperative:
    "Leaves with the operator's help in the next round. Fast and cheap; needs the operator online.",
  unilateral:
    "Forces your funds on-chain without anyone's cooperation. Always available, but slow and pays on-chain fees.",
};

const makeStyles = (p: Palette) => ({
  intro: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  progressList: {
    gap: 12,
    marginTop: 16,
  },
  progressRow: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  progressHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  progressKey: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  segmentWrap: {
    marginTop: 16,
  },
  hint: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  slot: {
    marginTop: 16,
  },
  action: {
    marginTop: 20,
  },
  cooperative: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    backgroundColor: p.accentFill,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cooperativeText: {
    color: p.onAccent,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  force: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    backgroundColor: p.badSoft,
    borderColor: p.bad,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  forceText: {
    color: p.bad,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.4,
  },
});

// ExitScreen is the reference Emergency exit flow: pick VTXOs, choose a
// cooperative or unilateral path, preview the funding plan for a unilateral
// exit, and start the batch. Any in-progress exits are tracked live at the top.
// It is reached from Settings, not the bottom bar, like the wallet-lifecycle
// screens.
export function ExitScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<ExitMode>('cooperative');
  const [destination, setDestination] = useState('');
  const [ackOpen, setAckOpen] = useState(false);
  const { plan, planData, planPending, resetPlan } = useWalletExitPlan();
  const {
    exitBatch,
    exitBatchEvents,
    exitBatchPending,
    exitBatchData,
    resetExitBatch,
  } = useWalletExitBatch();
  const { summary } = useWalletExits();
  const { list, listData, listPending, listError } = useWalletList();

  useEffect(() => {
    void list({ view: 'vtxos' });
  }, [list]);

  useEffect(() => {
    if (mode === 'unilateral' && selected.length > 0) {
      void plan({ outpoints: selected });
    }
  }, [mode, selected, plan]);

  // Sum the sats of the outpoints that actually started, for the success panel.
  // Amounts come from the VTXO inventory, which the ExitResult does not carry.
  const vtxos = listData?.vtxos?.vtxos ?? [];
  const startedTotalSat = (exitBatchData?.started ?? []).reduce(
    (sum, e) =>
      sum + (vtxos.find((v) => v.outpoint === e.outpoint)?.amountSat ?? 0),
    0,
  );

  // Start another exit: clear the picker, destination, and plan, and drop
  // the last batch result so the run-progress panel resets.
  const startAnother = () => {
    setSelected([]);
    setDestination('');
    resetPlan();
    resetExitBatch();
  };

  const start = () =>
    mode === 'unilateral'
      ? exitBatch({ mode, outpoints: selected })
      : exitBatch({
          mode,
          outpoints: selected,
          destination: destination || undefined,
        });

  const cooperativeOff = selected.length === 0 || exitBatchPending;
  const forceOff = selected.length === 0 || !planData?.canStart;

  return (
    <ScrollView>
      <PageHead
        title="Emergency exit"
        subtitle="Recover your funds on-chain"
        accent="orange"
        onBack={() => onNavigate('settings')}
      />

      {summary && summary.exits.length > 0 ? (
        <Band tinted>
          <Label>In progress</Label>
          <View style={styles.progressList}>
            {summary.exits.map((e) => (
              <View key={e.outpoint} style={styles.progressRow} testID="exit-summary-row">
                <View style={styles.progressHead}>
                  <PhaseChip status={e.status} />
                  <Text style={styles.progressKey} numberOfLines={1}>
                    {shortKey(e.outpoint)}
                  </Text>
                </View>
                <ExitStatusPanel outpoint={e.outpoint} />
              </View>
            ))}
          </View>
        </Band>
      ) : null}

      <Band>
        <Label>Choose VTXOs</Label>
        <Text style={styles.intro}>
          Select the outputs to exit. Leave the rest in place to keep spending
          normally.
        </Text>
        <VTXOPicker
          vtxos={vtxos}
          pending={listPending}
          error={listError}
          selected={selected}
          onChange={setSelected}
          excludeOutpoints={summary?.exits.map((e) => e.outpoint) ?? []}
        />
      </Band>

      <Band tinted>
        <Label>Exit path</Label>
        <View style={styles.segmentWrap}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cooperative', label: 'Cooperative' },
              { value: 'unilateral', label: 'Unilateral' },
            ]}
          />
        </View>
        <Text style={styles.hint}>{MODE_HINT[mode]}</Text>

        <View style={styles.slot}>
          {mode === 'cooperative' ? (
            <Field
              label="Destination (optional)"
              placeholder="tb1q… · defaults to your wallet"
              value={destination}
              onChange={setDestination}
              mono
            />
          ) : planData ? (
            <ExitPlanSummary
              plan={planData}
              onRecheck={() => void plan({ outpoints: selected })}
              recheckPending={planPending}
            />
          ) : null}
        </View>

        <View style={styles.action}>
          {mode === 'unilateral' ? (
            <Pressable
              testID="open-ack"
              disabled={forceOff}
              onPress={() => setAckOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ disabled: forceOff }}
              style={[styles.force, forceOff && styles.disabled]}
            >
              <ShieldAlert size={16} color={palette.bad} />
              <Text style={styles.forceText}>Force unilateral exit</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="start-cooperative"
              disabled={cooperativeOff}
              onPress={() => void start().catch(() => {})}
              accessibilityRole="button"
              accessibilityState={{ disabled: cooperativeOff }}
              style={[styles.cooperative, cooperativeOff && styles.disabled]}
            >
              <LogOut size={16} color={palette.onAccent} />
              <Text style={styles.cooperativeText}>
                {exitBatchPending ? 'Starting…' : 'Exit cooperatively'}
              </Text>
              {!exitBatchPending ? (
                <ArrowRight size={16} color={palette.onAccent} />
              ) : null}
            </Pressable>
          )}
        </View>
      </Band>

      <ExitAckDialog
        open={ackOpen}
        busy={exitBatchPending}
        onConfirm={() => {
          setAckOpen(false);
          void start().catch(() => {});
        }}
        onCancel={() => setAckOpen(false)}
      />

      {exitBatchEvents.length > 0 ? (
        <ExitRunProgress
          events={exitBatchEvents}
          mode={mode}
          data={exitBatchData}
          totalSat={startedTotalSat}
          onStartAnother={startAnother}
        />
      ) : null}
    </ScrollView>
  );
}
