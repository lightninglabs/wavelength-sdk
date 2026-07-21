import { Text, View } from 'react-native';
import {
  AlertTriangle,
  ArrowUpRight,
  Info,
  Link2,
  RefreshCw,
  Timer,
  Zap,
} from 'lucide-react-native';
import { PrepareSendResult, SendRail } from '@lightninglabs/wavelength-react';
import { Band } from '../../components/ui/Band';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { SummaryRow } from '../../components/ui/SummaryRow';
import { approx, countdown, formatSats } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// RAIL_LABEL names each settlement rail for the pill above the review rows. The
// quote is authoritative here: an invoice-shaped destination can still settle
// in Ark, on credit, or across a mix (an address always settles on-chain).
// Keep this identical to the web copy.
const RAIL_LABEL: Record<SendRail, string> = {
  unspecified: 'Payment',
  offchain_unknown: 'Off-chain',
  in_ark: 'In Ark',
  lightning: 'Lightning',
  onchain: 'On-chain',
  credit: 'Credit',
  mixed: 'Mixed',
};

// feeLabel names the fee row per rail. A routing fee and a mining fee are
// different things and the old screen called both "routing".
function feeLabel(rail: SendRail): string {
  if (rail === 'lightning') {
    return 'Routing fee';
  }

  if (rail === 'onchain') {
    return 'Network fee';
  }

  return 'Fee';
}

// railIcon matches the Confirm button to the rail the quote actually settles on.
// A lightning bolt on an on-chain payment is a lie about where the money goes.
function railIcon(rail: SendRail) {
  if (rail === 'lightning') return Zap;
  if (rail === 'onchain') return Link2;
  return ArrowUpRight;
}

const makeStyles = (p: Palette) => ({
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  pill: {
    backgroundColor: p.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillText: {
    color: p.accent,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  rows: {
    gap: 12,
    marginTop: 16,
  },
  divider: {
    backgroundColor: p.border,
    height: 1,
  },
  callout: {
    alignItems: 'flex-start' as const,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 16,
    padding: 12,
  },
  calloutInfo: {
    backgroundColor: p.well,
    borderColor: p.border,
  },
  calloutWarn: {
    backgroundColor: p.warnSoft,
    borderColor: p.warn,
  },
  calloutBad: {
    backgroundColor: p.badSoft,
    borderColor: p.bad,
  },
  calloutText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  action: {
    marginTop: 20,
  },
  timer: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 12,
    textAlign: 'center' as const,
  },
  error: {
    marginTop: 12,
  },
});

// QuoteReview presents a prepareSend quote and the single action it permits: a
// live quote can be paid, an expired one can only be re-quoted. Every value here
// comes from the daemon; nothing is user-entered.
export function QuoteReview({
  quote,
  destination,
  expired,
  secondsLeft,
  quoting,
  busy,
  error,
  onConfirm,
  onRefresh,
}: {
  quote: PrepareSendResult;
  destination: string;
  expired: boolean;
  secondsLeft: number;
  quoting: boolean;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const showTo =
    quote.destinationSummary && quote.destinationSummary !== destination.trim();

  return (
    <Band tinted>
      <View style={styles.head}>
        <Label>Review</Label>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{RAIL_LABEL[quote.rail]}</Text>
        </View>
      </View>

      <View style={[styles.rows, expired && { opacity: 0.3 }]}>
        {showTo ? (
          <SummaryRow label="To" value={quote.destinationSummary} mono />
        ) : null}
        {quote.invoiceDescription ? (
          <SummaryRow label="For" value={quote.invoiceDescription} />
        ) : null}
        <SummaryRow label="Amount" value={`${formatSats(quote.amountSat)} sats`} mono />
        <SummaryRow
          label={feeLabel(quote.rail)}
          value={approx(quote.expectedFeeSat, quote.feeKnown)}
          mono
        />
        <View style={styles.divider} />
        <SummaryRow
          label="Total"
          value={approx(quote.expectedTotalOutflowSat, quote.totalOutflowKnown)}
          mono
        />
      </View>

      {expired ? (
        <View style={[styles.callout, styles.calloutBad]}>
          <Timer size={14} color={palette.bad} style={{ marginTop: 2 }} />
          <Text style={[styles.calloutText, { color: palette.bad }]}>
            This quote expired. Fees may have changed.
          </Text>
        </View>
      ) : quote.warning ? (
        <View style={[styles.callout, styles.calloutWarn]}>
          <AlertTriangle size={14} color={palette.warn} style={{ marginTop: 2 }} />
          <Text style={[styles.calloutText, { color: palette.warn }]}>
            {quote.warning}
          </Text>
        </View>
      ) : !quote.feeKnown ? (
        <View style={[styles.callout, styles.calloutInfo]}>
          <Info size={14} color={palette.orange} style={{ marginTop: 2 }} />
          <Text style={[styles.calloutText, { color: palette.muted }]}>
            The fee shown is an estimate. The final amount is returned once the
            payment settles.
          </Text>
        </View>
      ) : null}

      <View style={styles.action}>
        {expired ? (
          <GhostButton
            icon={RefreshCw}
            onPress={onRefresh}
            disabled={quoting}
            busy={quoting}
          >
            Refresh quote
          </GhostButton>
        ) : (
          <PrimaryButton
            icon={railIcon(quote.rail)}
            onPress={onConfirm}
            disabled={busy}
            busy={busy}
          >
            {busy ? 'Paying…' : 'Confirm & pay'}
          </PrimaryButton>
        )}
      </View>

      {!expired ? (
        <Text style={styles.timer}>Quote valid for {countdown(secondsLeft)}</Text>
      ) : null}

      <View style={styles.error}>
        <InlineError message={error} />
      </View>
    </Band>
  );
}
