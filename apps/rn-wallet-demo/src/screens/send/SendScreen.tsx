import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AlertTriangle, ArrowRight, Check, Info, Link2, Zap } from 'lucide-react-native';
import {
  PrepareSendResult,
  SendRequest,
  classifyDestination,
  useWalletPrepareSend,
  useWalletSend,
} from '@lightninglabs/wavelength-react';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { CopyRow } from '../../components/ui/CopyRow';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { ToggleRow } from '../../components/ui/ToggleRow';
import { errorMessage } from '../../lib/errors';
import { formatSats } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { QuoteReview } from './QuoteReview';

// nowSeconds is the unix clock the quote countdown compares against.
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// QUOTE_TIMEOUT_MS bounds a prepareSend that never settles. Observed live: the
// daemon can accept the call and never answer, which left the button stuck on
// "Quoting..." with no error and no way back.
const QUOTE_TIMEOUT_MS = 60_000;

const makeStyles = (p: Palette) => ({
  fields: {
    gap: 16,
    marginTop: 16,
  },
  head: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 16,
    justifyContent: 'space-between' as const,
  },
  pill: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillLightning: {
    backgroundColor: p.accentSoft,
  },
  pillAddress: {
    backgroundColor: p.warnSoft,
  },
  pillText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  eyebrow: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  destInput: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
    minHeight: 72,
    padding: 12,
    textAlignVertical: 'top' as const,
  },
  hint: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    padding: 12,
  },
  hintText: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  hintValue: {
    color: p.text,
    fontFamily: fonts.mono,
  },
  notice: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.warnSoft,
    borderColor: p.warn,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    padding: 12,
  },
  noticeText: {
    color: p.warn,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  recap: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 16,
    justifyContent: 'space-between' as const,
    marginTop: 16,
  },
  recapText: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  editText: {
    color: p.accent,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  sentWrap: {
    alignItems: 'center' as const,
  },
  sentIcon: {
    alignItems: 'center' as const,
    backgroundColor: p.goodSoft,
    height: 48,
    justifyContent: 'center' as const,
    width: 48,
  },
  sentAmount: {
    color: p.text,
    fontFamily: fonts.monoMedium,
    fontSize: 30,
    marginTop: 16,
  },
  sentUnit: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  sentHash: {
    alignSelf: 'stretch' as const,
    marginTop: 20,
  },
  sentActions: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 24,
  },
  sentAction: {
    flex: 1,
  },
  error: {
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});

// SendScreen walks a payment through form -> quote -> sent. Step one collects
// only what cannot be derived from the destination; the quote supplies the
// rest. Quoting and dispatch are self-served from the provider; only the
// spendable balance (for the sweep-all guard) and tab routing come from the
// caller.
export function SendScreen({
  onNavigate,
  balanceSat,
}: {
  onNavigate: (tab: AppTab) => void;
  balanceSat: number;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { prepare } = useWalletPrepareSend();
  const { sendPrepared, sendPending } = useWalletSend();
  const [dest, setDest] = useState('');
  const [amount, setAmount] = useState('');
  const [sweepAll, setSweepAll] = useState(false);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<PrepareSendResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [localError, setLocalError] = useState('');
  const [quoting, setQuoting] = useState(false);
  // sent is the success discriminator: a resolved dispatch sets it (even when
  // the result carries no hash), so a settled payment always shows the
  // confirmation instead of leaving the form to invite a double send.
  const [sent, setSent] = useState<{ hash: string; amountSat: number } | null>(
    null,
  );

  // quoteToken invalidates in-flight quotes. A prepareSend that hangs and later
  // resolves must not overwrite state the user has since moved on from.
  const quoteToken = useRef(0);

  const destination = classifyDestination(dest);
  const isInvoice = destination.kind === 'invoice';
  const isAddress = destination.kind === 'address';
  const isAmountlessInvoice =
    isInvoice && destination.amount.status === 'amountless';
  // The daemon ignores amountSat on the invoice path and currently rejects an
  // amountless invoice outright, so an invoice never asks for an amount. An
  // address does unless it is sweeping everything.
  const needsAmount = isAddress && !sweepAll;
  const amountReady =
    !needsAmount || (Number.isInteger(Number(amount)) && Number(amount) > 0);
  // The sweep path has nothing to send when the balance is zero.
  const sweepReady = !sweepAll || balanceSat > 0;
  const canContinue =
    destination.kind !== 'empty' &&
    !isAmountlessInvoice &&
    amountReady &&
    sweepReady &&
    !quoting;

  // The countdown ticks only while a live quote is on screen. It is the whole
  // of the expiry mechanism: at zero, QuoteReview swaps Confirm for Refresh.
  // This covers the common case, not every case: the daemon can still reject
  // sendPrepared with the invalid-intent sentinel (clock skew, a suspended
  // tab, or a race across the boundary), and that rejection burns the quote,
  // which is why confirm() clears it below.
  useEffect(() => {
    if (!quote) {
      return;
    }

    const tick = () => setSecondsLeft(quote.expiresAtUnix - nowSeconds());
    tick();
    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [quote]);

  // buildRequest maps the step-one inputs onto the wire shape. sweepAll and
  // amountSat are mutually exclusive on the wire: the daemon rejects a
  // sweep_all request that also carries a non-zero amount. The invoice arm
  // never sends amountSat: the daemon ignores it on that path.
  function buildRequest(): SendRequest {
    const trimmed = dest.trim();
    const common = note ? { note } : {};

    if (isInvoice) {
      return {
        invoice: trimmed,
        ...common,
      };
    }

    return {
      onchainAddress: trimmed,
      ...(sweepAll ? { sweepAll: true } : { amountSat: Number(amount) }),
      ...common,
    };
  }

  // requestQuote quotes the payment. A failure is safe to retry, so it
  // surfaces inline and leaves the user on the form. quoting is local state
  // rather than the provider's busy flag: a hung prepare never resolves that
  // flag, so it cannot drive a timeout or a way back to the form.
  async function requestQuote() {
    const token = ++quoteToken.current;
    setLocalError('');
    setQuoting(true);

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('quote timed out'));
      }, QUOTE_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([prepare(buildRequest()), timeout]);
      clearTimeout(timer);
      // A stale token means the user has since cancelled or edited the
      // destination; a late response must not overwrite what they see now.
      if (quoteToken.current !== token) {
        return;
      }
      setQuote(result);
      // Seed the countdown from the quote itself, in the same tick that stores
      // it. Otherwise secondsLeft starts at 0 and QuoteReview paints "expired"
      // for one frame, until the effect's own tick() corrects it.
      setSecondsLeft(result.expiresAtUnix - nowSeconds());
    } catch (err) {
      clearTimeout(timer);
      if (quoteToken.current !== token) {
        return;
      }
      setLocalError(
        timedOut
          ? 'The quote is taking too long. Check your connection and try again.'
          : errorMessage(err),
      );
    } finally {
      if (quoteToken.current === token) {
        setQuoting(false);
      }
    }
  }

  // cancelQuote gives up on an in-flight quote. It bumps the token so a late
  // response from the abandoned prepareSend cannot land, and hands the user
  // back a usable form instead of an indefinite spinner.
  function cancelQuote() {
    quoteToken.current += 1;
    setQuoting(false);
    setLocalError('');
  }

  // confirm dispatches the quoted payment. The daemon deletes the send intent
  // before dispatching it to the backend, so any failure here burns the
  // intent regardless of whether the payment actually went out. It also
  // returns a single sentinel for a missing, expired, or already-consumed
  // intent ('send intent is missing, expired, or already consumed'), so the
  // message cannot say which one happened. On a money screen, wrongly telling
  // the user nothing was sent is far worse than wrongly telling them to check
  // Activity, so always show the cautious message and discard the burned
  // quote: leaving it on screen would re-enable Confirm & pay on an intent
  // that can now only fail again.
  async function confirm() {
    if (!quote) {
      return;
    }

    setLocalError('');
    try {
      const result = await sendPrepared(quote);
      setSent({
        hash: result.paymentHash || result.entry?.id || '',
        amountSat:
          result.actualAmountSat ||
          Math.abs(result.entry?.amountSat ?? 0) ||
          quote.amountSat,
      });
    } catch (err) {
      setLocalError(
        `${errorMessage(err)}. Check Activity before retrying: the payment may already have been sent.`,
      );
      setQuote(null);
    }
  }

  function reset() {
    setSent(null);
    setQuote(null);
    setDest('');
    setAmount('');
    setSweepAll(false);
    setNote('');
    setLocalError('');
  }

  if (sent) {
    return (
      <ScrollView>
        <PageHead
          title="Payment sent"
          subtitle="Submitted to the network"
          accent="orange"
          onBack={() => onNavigate('home')}
        />
        <Band tinted>
          <View style={styles.sentWrap}>
            <View style={styles.sentIcon}>
              <Check size={22} color={palette.good} />
            </View>
            <Text style={styles.sentAmount}>
              {sent.amountSat > 0 ? formatSats(sent.amountSat) : '-'}
              <Text style={styles.sentUnit}> sats</Text>
            </Text>
            {sent.hash ? (
              <View style={styles.sentHash}>
                <CopyRow label="Payment hash" value={sent.hash} />
              </View>
            ) : null}
            <View style={styles.sentActions}>
              <View style={styles.sentAction}>
                <GhostButton onPress={reset}>Send another</GhostButton>
              </View>
              <View style={styles.sentAction}>
                <PrimaryButton onPress={() => onNavigate('activity')}>
                  View in activity
                </PrimaryButton>
              </View>
            </View>
          </View>
        </Band>
      </ScrollView>
    );
  }

  // Step two: the form collapses to a recap row so the destination stays
  // readable while the user commits to paying it.
  if (quote) {
    return (
      <ScrollView>
        <PageHead
          title="Send"
          subtitle="Review and confirm"
          accent="orange"
          onBack={() => onNavigate('home')}
        />
        <Band>
          <Label accent="orange" rule>
            Payment details
          </Label>
          <View style={styles.recap}>
            <Text style={styles.recapText} numberOfLines={1}>
              {dest.trim()}
            </Text>
            <Pressable
              // cancelQuote bumps quoteToken, so a Refresh that is still in
              // flight cannot resolve and bounce the user back into review with
              // a stale quote. It also clears `quoting` and the error.
              onPress={() => {
                cancelQuote();
                setQuote(null);
              }}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>
        </Band>
        <QuoteReview
          quote={quote}
          destination={dest}
          expired={secondsLeft <= 0}
          secondsLeft={secondsLeft}
          quoting={quoting}
          busy={sendPending}
          error={localError}
          onConfirm={() => void confirm()}
          onRefresh={() => void requestQuote()}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <PageHead
        title="Send"
        subtitle="Pay an invoice or on-chain address"
        accent="orange"
        onBack={() => onNavigate('home')}
      />
      <Band>
        <View style={styles.head}>
          <Label>Payment details</Label>
          {/* Provisional: classifyDestination cannot see a settlement rail, so
            this pill only confirms the input parsed as an invoice or an
            address. quote.rail in step 2 is authoritative and may differ
            (e.g. an invoice can still settle in_ark, credit, or mixed). */}
          {isInvoice ? (
            <View style={[styles.pill, styles.pillLightning]}>
              <Zap size={11} color={palette.accent} />
              <Text style={[styles.pillText, { color: palette.accent }]}>
                Lightning
              </Text>
            </View>
          ) : isAddress ? (
            <View style={[styles.pill, styles.pillAddress]}>
              <Link2 size={11} color={palette.warn} />
              <Text style={[styles.pillText, { color: palette.warn }]}>
                On-chain
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.fields}>
          <View>
            <Text style={styles.eyebrow}>Invoice or address</Text>
            <TextInput
              value={dest}
              onChangeText={setDest}
              multiline
              placeholder="lnbc… or tb1q…"
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.destInput}
            />
          </View>

          {isInvoice && destination.amount.status === 'known' ? (
            <View style={styles.hint}>
              <Info size={14} color={palette.orange} style={{ marginTop: 2 }} />
              <Text style={styles.hintText}>
                Amount is set by the invoice:{' '}
                <Text style={styles.hintValue}>
                  {formatSats(destination.amount.sat)} sats
                </Text>
              </Text>
            </View>
          ) : null}

          {isInvoice && destination.amount.status === 'unrepresentable' ? (
            <View style={styles.hint}>
              <Info size={14} color={palette.orange} style={{ marginTop: 2 }} />
              <Text style={styles.hintText}>Amount is set by the invoice.</Text>
            </View>
          ) : null}

          {isAmountlessInvoice ? (
            <View style={styles.notice}>
              <AlertTriangle size={14} color={palette.warn} style={{ marginTop: 2 }} />
              <Text style={styles.noticeText}>
                This invoice carries no amount. Amountless invoices are not
                supported yet.
              </Text>
            </View>
          ) : null}

          {isAddress ? (
            <ToggleRow
              title="Send max"
              subtitle="Sweep the full spendable balance"
              on={sweepAll}
              onChange={setSweepAll}
            />
          ) : null}

          {needsAmount ? (
            <Field
              label="Amount (sats)"
              placeholder="Amount to send"
              numeric
              value={amount}
              onChange={setAmount}
              mono
            />
          ) : null}

          {isAddress && sweepAll ? (
            <Field
              label="Amount (sats)"
              value={String(balanceSat)}
              onChange={() => {}}
              disabled
              mono
            />
          ) : null}

          <Field
            label="Note"
            placeholder="optional · stored locally"
            value={note}
            onChange={setNote}
            autoCapitalize="sentences"
          />

          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <PrimaryButton
                icon={ArrowRight}
                iconRight
                onPress={() => {
                  if (canContinue) {
                    void requestQuote();
                  }
                }}
                disabled={!canContinue}
                busy={quoting}
              >
                {quoting ? 'Quoting…' : 'Continue'}
              </PrimaryButton>
            </View>
            {quoting ? (
              <View style={styles.actionButton}>
                <GhostButton onPress={cancelQuote}>Cancel</GhostButton>
              </View>
            ) : null}
          </View>
        </View>
      </Band>
      {localError ? (
        <Band tinted>
          <View style={styles.error}>
            <InlineError message={localError} />
          </View>
        </Band>
      ) : null}
    </ScrollView>
  );
}
