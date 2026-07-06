import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, ClipboardPaste, ShieldCheck, Zap } from 'lucide-react-native';
import { SendRequest, SendResult } from '@lightninglabs/walletdk-react';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { CopyRow } from '../../components/ui/CopyRow';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { SummaryRow } from '../../components/ui/SummaryRow';
import { errorMessage } from '../../lib/errors';
import { formatSats, shortKey } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// isInvoice reports whether a destination string looks like a BOLT-11 invoice
// (versus an on-chain address).
function isInvoice(dest: string): boolean {
  return /^ln/i.test(dest.trim());
}

const makeStyles = (p: Palette) => ({
  fields: {
    gap: 16,
    marginTop: 16,
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
  pasteRow: {
    marginTop: 8,
  },
  review: {
    gap: 12,
    marginTop: 16,
  },
  note: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 16,
    padding: 12,
  },
  noteText: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  action: {
    marginTop: 20,
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
});

// SendScreen pays a BOLT-11 invoice or on-chain address, with a live review
// summary and a settled-payment confirmation showing the payment hash.
export function SendScreen({
  onNavigate,
  onSend,
  busy,
  error,
}: {
  onNavigate: (tab: AppTab) => void;
  onSend: (req: SendRequest) => Promise<SendResult>;
  busy: boolean;
  error: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [dest, setDest] = useState('');
  const [amount, setAmount] = useState('');
  const [maxFee, setMaxFee] = useState('0');
  const [note, setNote] = useState('');
  // sent is the success discriminator: a resolved onSend sets it (even when the
  // result carries no hash), so a settled payment always shows the
  // confirmation instead of leaving the form to invite a double send.
  const [sent, setSent] = useState<{ hash: string; amountSat: number } | null>(
    null,
  );
  const [localError, setLocalError] = useState('');

  async function pay() {
    setLocalError('');
    const trimmed = dest.trim();
    const req: SendRequest = isInvoice(trimmed)
      ? { invoice: trimmed }
      : { onchainAddress: trimmed };
    if (amount) {
      req.amountSat = Number(amount) || 0;
    }
    if (maxFee) {
      req.maxFeeSat = Number(maxFee) || 0;
    }
    if (note) {
      req.note = note;
    }

    try {
      const result = await onSend(req);
      // Prefer the settled amount from the result (an amountless invoice has
      // no user-entered amount), falling back to the Entry then the typed
      // value. The hash is display-only; success does not depend on it.
      setSent({
        hash: result.paymentHash || result.entry?.id || '',
        amountSat:
          result.actualAmountSat ||
          Math.abs(result.entry?.amountSat ?? 0) ||
          Number(amount) ||
          0,
      });
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  async function pasteDest() {
    // A clipboard read can reject under platform access restrictions; treat a
    // failure as an empty clipboard so the Paste button is a no-op rather than
    // an unhandled rejection.
    let text = '';
    try {
      text = (await Clipboard.getStringAsync()).trim();
    } catch {
      return;
    }
    if (text) {
      setDest(text);
    }
  }

  function reset() {
    setSent(null);
    setDest('');
    setAmount('');
    setMaxFee('0');
    setNote('');
  }

  if (sent) {
    return (
      <ScrollView>
        <PageHead
          title="Payment sent"
          subtitle="Submitted to the network"
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

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <PageHead
        title="Send"
        subtitle="Pay an invoice or on-chain address"
        onBack={() => onNavigate('home')}
      />
      <Band>
        <Label>Payment details</Label>
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
            <View style={styles.pasteRow}>
              <GhostButton
                icon={ClipboardPaste}
                onPress={() => void pasteDest()}
                block={false}
              >
                Paste
              </GhostButton>
            </View>
          </View>
          <Field
            label="Amount (sats)"
            placeholder="from invoice"
            numeric
            value={amount}
            onChange={setAmount}
            mono
          />
          <Field
            label="Max routing fee (sats)"
            numeric
            value={maxFee}
            onChange={setMaxFee}
            mono
          />
          <Field
            label="Note"
            placeholder="optional · stored locally"
            value={note}
            onChange={setNote}
            autoCapitalize="sentences"
          />
        </View>
      </Band>

      <Band tinted>
        <Label>Review</Label>
        <View style={styles.review}>
          <SummaryRow
            label="Destination"
            value={dest.trim() ? shortKey(dest.trim(), 10, 8) : '-'}
            mono
          />
          <SummaryRow
            label="Amount"
            value={amount ? `${formatSats(Number(amount) || 0)} sats` : 'Per invoice'}
            mono
          />
          <SummaryRow
            label="Max routing fee"
            value={`${formatSats(Number(maxFee) || 0)} sats`}
            mono
          />
        </View>
        <View style={styles.note}>
          <ShieldCheck size={14} color={palette.accent} style={{ marginTop: 2 }} />
          <Text style={styles.noteText}>
            The final amount and payment hash are returned once the payment
            settles.
          </Text>
        </View>
        <View style={styles.action}>
          <PrimaryButton
            icon={Zap}
            onPress={() => {
              if (!busy && dest.trim()) {
                void pay();
              }
            }}
            disabled={busy || dest.trim().length === 0}
            busy={busy}
          >
            {busy ? 'Paying…' : 'Confirm & pay'}
          </PrimaryButton>
        </View>
        <View style={{ marginTop: 12 }}>
          <InlineError message={localError || error} />
        </View>
      </Band>
    </ScrollView>
  );
}
