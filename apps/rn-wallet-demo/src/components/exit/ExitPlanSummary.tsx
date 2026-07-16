import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Info, RefreshCw, TriangleAlert, Wallet } from 'lucide-react-native';
import {
  isExitInfeasibilityFundable,
  type ExitPlanEntry,
  type GetExitPlanResult,
} from '@lightninglabs/wavelength-react';
import { formatSats, shortKey } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { CopyRow } from '../ui/CopyRow';
import { SummaryRow } from '../ui/SummaryRow';

const makeStyles = (p: Palette) => ({
  wrap: {
    marginTop: 16,
  },
  summary: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  blocked: {
    gap: 12,
    marginTop: 12,
  },
  fundable: {
    backgroundColor: p.warnSoft,
    borderColor: p.warn,
    borderWidth: 1,
    padding: 12,
  },
  fundableHead: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  fundableTitle: {
    color: p.warn,
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  fundableWhy: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  fundableSend: {
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  bold: {
    fontFamily: fonts.sansSemiBold,
  },
  haveRow: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 6,
    marginTop: 4,
  },
  haveText: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
  },
  haveMono: {
    fontFamily: fonts.mono,
  },
  splitText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  copyWrap: {
    marginTop: 12,
  },
  recheck: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recheckText: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  structural: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.badSoft,
    borderColor: p.bad,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    padding: 12,
  },
  structuralText: {
    color: p.bad,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  structuralKey: {
    fontFamily: fonts.mono,
  },
});

// ExitPlanSummary previews a unilateral exit: the aggregate funding the backing
// wallet needs, plus, for each outpoint that cannot start, either a fundable
// "top up this address" affordance or a terminal structural message. The
// Re-check control re-runs the plan; ExitScreen owns the plan and supplies it.
export function ExitPlanSummary({
  plan,
  onRecheck,
  recheckPending,
}: {
  plan: GetExitPlanResult;
  onRecheck: () => void;
  recheckPending: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const blocked = plan.plans.filter((p) => !p.canStart);

  return (
    <View style={styles.wrap} testID="exit-plan-summary">
      <View style={styles.summary}>
        <SummaryRow
          label="Fee rate"
          value={`${plan.feeRateSatPerVByte} sat/vB`}
          mono
        />
        <SummaryRow
          label="Funding needed"
          value={`${formatSats(plan.totalRecommendedFundingSat)} sats`}
          mono
        />
        <SummaryRow
          label="Shortfall"
          value={`${formatSats(plan.totalFundingShortfallSat)} sats`}
          mono
        />
      </View>

      {blocked.length > 0 ? (
        <View style={styles.blocked}>
          {blocked.map((p) =>
            isExitInfeasibilityFundable(p.infeasibilityReason) ? (
              <FundingBlock
                key={p.outpoint}
                entry={p}
                feeRateSatPerVByte={plan.feeRateSatPerVByte}
                onRecheck={onRecheck}
                recheckPending={recheckPending}
              />
            ) : (
              <View
                key={p.outpoint}
                testID="exit-structural"
                style={styles.structural}
              >
                <TriangleAlert
                  size={14}
                  color={palette.bad}
                  style={{ marginTop: 1 }}
                />
                <Text style={styles.structuralText}>
                  <Text style={styles.structuralKey}>
                    {shortKey(p.outpoint)}
                  </Text>
                  : cannot be exited economically ({p.infeasibilityReason}).
                  {p.infeasibilityReason === 'uneconomical'
                    ? ' The recovery fee is more than the VTXO is worth at the current fee rate; a larger VTXO or a lower fee rate makes it economical.'
                    : ''}
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

// FundingBlock leads with how much to send and why, then the fundable address
// and a Re-check control, so a stuck tester knows the next concrete step.
function FundingBlock({
  entry,
  feeRateSatPerVByte,
  onRecheck,
  recheckPending,
}: {
  entry: ExitPlanEntry;
  feeRateSatPerVByte: number;
  onRecheck: () => void;
  recheckPending: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const have = entry.recommendedTotalFundingSat - entry.fundingShortfallSat;
  const needsSplit = entry.requiredFeeUTXOCount > entry.usableFeeUTXOCount;

  return (
    <View style={styles.fundable}>
      <View style={styles.fundableHead}>
        <Wallet size={14} color={palette.warn} style={{ marginTop: 1 }} />
        <Text style={styles.fundableTitle}>
          Your backing wallet needs on-chain funds
        </Text>
      </View>
      <Text style={styles.fundableWhy}>
        A unilateral exit pays on-chain miner fees to force your VTXO out. Those
        fees come from your backing wallet, which is currently short.
      </Text>
      <Text style={styles.fundableSend}>
        <Text style={styles.bold}>
          Send ~{formatSats(entry.fundingShortfallSat)} sats
        </Text>{' '}
        to the address below, then <Text style={styles.bold}>Re-check</Text>.
      </Text>
      <View style={styles.haveRow}>
        <Info size={12} color={palette.muted} style={{ marginTop: 1 }} />
        <Text style={styles.haveText}>
          Backing wallet has{' '}
          <Text style={styles.haveMono}>{formatSats(have)}</Text> of{' '}
          <Text style={styles.haveMono}>
            {formatSats(entry.recommendedTotalFundingSat)}
          </Text>{' '}
          sats needed - fee rate{' '}
          <Text style={styles.haveMono}>{feeRateSatPerVByte}</Text> sat/vB
        </Text>
      </View>
      {needsSplit ? (
        <Text style={styles.splitText}>
          Send this across {entry.requiredFeeUTXOCount} separate payments so the
          wallet has enough fee inputs.
        </Text>
      ) : null}
      <View style={styles.copyWrap}>
        <CopyRow label="Funding address" value={entry.fundingAddress} />
      </View>
      <Pressable
        testID="exit-recheck"
        disabled={recheckPending}
        onPress={onRecheck}
        accessibilityRole="button"
        accessibilityState={{ disabled: recheckPending }}
        style={[styles.recheck, recheckPending && styles.disabled]}
      >
        {recheckPending ? (
          <ActivityIndicator size={16} color={palette.text} />
        ) : (
          <RefreshCw size={16} color={palette.text} />
        )}
        <Text style={styles.recheckText}>
          {recheckPending ? 'Re-checking…' : 'Re-check'}
        </Text>
      </Pressable>
    </View>
  );
}
