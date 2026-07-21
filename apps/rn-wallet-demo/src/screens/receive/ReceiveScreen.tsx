import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Layers, Zap } from 'lucide-react-native';
import {
  useWalletActivity,
  useWalletBalance,
  useWalletDeposit,
  useWalletReceive,
} from '@lightninglabs/wavelength-react';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { CopyRow } from '../../components/ui/CopyRow';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { QRCode } from '../../components/ui/QRCode';
import { Segmented } from '../../components/ui/Segmented';
import { errorMessage } from '../../lib/errors';
import { formatSats } from '../../lib/format';
import {
  hasPendingOnchain,
  usePollWhileWaiting,
} from '../../lib/usePollWhileWaiting';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

type Tab = 'lightning' | 'onchain';

const makeStyles = (p: Palette) => ({
  fields: {
    gap: 16,
    marginTop: 20,
  },
  note: {
    alignItems: 'flex-start' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 20,
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
  result: {
    alignItems: 'center' as const,
    gap: 16,
  },
  resultCopy: {
    alignSelf: 'stretch' as const,
  },
  waiting: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    textAlign: 'center' as const,
  },
  received: {
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 16,
  },
  receivedTitle: {
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  receivedAmount: {
    color: p.good,
    fontFamily: fonts.mono,
    fontSize: 26,
    fontWeight: '600' as const,
  },
});

// ReceiveScreen offers a Lightning invoice (amount + memo) or an on-chain
// boarding address, each paired with a scannable QR. Values come from the
// live receive()/deposit() calls, self-served here from the provider. Once a
// payment lands, the provider's activity stream surfaces the matching entry,
// which flips the QR to a received confirmation without any manual refresh.
export function ReceiveScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const activity = useWalletActivity();
  const balance = useWalletBalance();
  const { receive, receivePending, receiveError } = useWalletReceive();
  const { deposit, depositPending, depositError } = useWalletDeposit();
  const [tab, setTab] = useState<Tab>('lightning');
  const [amount, setAmount] = useState('1000');
  const [memo, setMemo] = useState('');
  const [invoice, setInvoice] = useState('');
  const [address, setAddress] = useState('');
  const [localError, setLocalError] = useState('');
  // The id of the entry each tab's request created, so the live activity list
  // can be matched back to it when it settles. Keyed per tab: a Lightning
  // invoice must keep its confirmation hook across a trip to the on-chain tab
  // and back, since its QR stays on screen and only the id can match it.
  const [pendingEntryId, setPendingEntryId] = useState<Record<Tab, string>>({
    lightning: '',
    onchain: '',
  });

  const isLn = tab === 'lightning';
  // The QR block only appears once a value has been generated.
  const result = isLn ? invoice : address;
  const trackedId = pendingEntryId[tab];
  // The activity entry for this request. Lightning matches on the id receive()
  // returned, which the daemon keeps stable. On-chain also matches the boarding
  // address, because a confirmed deposit row is keyed deposit-<address>: that
  // arm is what survives a reload, where the id from deposit() is lost.
  const match = activity.find((e) => {
    if (trackedId && e.id === trackedId) {
      return true;
    }

    return !isLn && Boolean(address) && e.request?.onchainAddress === address;
  });
  // A receive that failed (expired invoice, rejected swap, timed-out HTLC) must
  // not leave a live-looking QR on screen promising it updates automatically.
  const failed = match?.status === 'failed' ? match : undefined;
  // Treat it as received once complete, or, on-chain, as soon as the deposit is
  // detected (pending): funds have arrived; boarding into a spendable VTXO just
  // confirms afterward. A Lightning receive only counts when complete.
  const settled =
    !failed &&
    match &&
    (match.status === 'complete' || (!isLn && match.status === 'pending'))
      ? match
      : undefined;

  // On-chain boarding deposits are not pushed on the activity stream, so poll
  // while an on-chain address is shown and not yet detected. Once a pending
  // on-chain entry exists, the app-level poll takes over tracking it, so stop
  // here to avoid a double poll. Lightning receives arrive via the stream, and a
  // failed receive is terminal, so neither keeps polling.
  usePollWhileWaiting(
    !isLn &&
      Boolean(address) &&
      !settled &&
      !failed &&
      !hasPendingOnchain(activity, balance),
  );

  function trackEntry(forTab: Tab, id: string) {
    setPendingEntryId((current) => ({ ...current, [forTab]: id }));
  }

  function switchTab(next: Tab) {
    // Clear the local error so an invoice failure does not linger under the
    // on-chain tab (and vice versa). Each tab keeps its own request.
    setLocalError('');
    setTab(next);
  }

  async function createInvoice() {
    setLocalError('');
    trackEntry('lightning', '');
    try {
      const next = await receive({
        amountSat: Number(amount) || 0,
        memo: memo || undefined,
      });
      setInvoice(next.invoice);
      trackEntry('lightning', next.entry.id);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  async function getAddress() {
    setLocalError('');
    trackEntry('onchain', '');
    try {
      const next = await deposit();
      setAddress(next.address);
      trackEntry('onchain', next.entry.id);
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <PageHead
        title="Receive"
        subtitle="Share an invoice or boarding address"
        accent="sky"
        onBack={() => onNavigate('home')}
      />

      <Band>
        <Label>Method</Label>
        <View style={{ marginTop: 12 }}>
          <Segmented
            value={tab}
            onChange={switchTab}
            options={[
              { value: 'lightning', label: 'Lightning' },
              { value: 'onchain', label: 'On-chain' },
            ]}
          />
        </View>

        {isLn ? (
          <View style={styles.fields}>
            <Field
              label="Amount (sats)"
              numeric
              value={amount}
              onChange={setAmount}
              mono
            />
            <Field label="Memo" value={memo} onChange={setMemo} autoCapitalize="sentences" />
          </View>
        ) : (
          <View style={styles.note}>
            <Layers size={14} color={palette.accent} style={{ marginTop: 2 }} />
            <Text style={styles.noteText}>
              Funds become spendable after 1 confirmation.
            </Text>
          </View>
        )}

        <View style={styles.action}>
          {isLn ? (
            <PrimaryButton icon={Zap} onPress={() => void createInvoice()} busy={receivePending}>
              {receivePending
                ? 'Creating invoice…'
                : invoice
                  ? 'Create another'
                  : 'Create invoice'}
            </PrimaryButton>
          ) : address ? (
            <GhostButton onPress={() => onNavigate('home')}>Done</GhostButton>
          ) : (
            <PrimaryButton icon={Layers} onPress={() => void getAddress()} busy={depositPending}>
              {depositPending ? 'Generating…' : 'Get boarding address'}
            </PrimaryButton>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <InlineError
            message={
              localError || (isLn ? receiveError : depositError)?.message || ''
            }
          />
        </View>
      </Band>

      {failed ? (
        <Band tinted>
          <View style={styles.received}>
            <AlertTriangle size={40} color={palette.bad} />
            <Text style={styles.receivedTitle}>Payment failed</Text>
            <Text style={styles.waiting}>
              {failed.failureReason ||
                'This request did not complete. Create a new one to try again.'}
            </Text>
            <GhostButton onPress={() => onNavigate('home')}>Done</GhostButton>
          </View>
        </Band>
      ) : settled ? (
        <Band tinted>
          <View style={styles.received}>
            <CheckCircle2 size={40} color={palette.good} />
            <Text style={styles.receivedTitle}>Payment received</Text>
            <Text style={styles.receivedAmount}>
              +{formatSats(Math.abs(settled.amountSat))} sats
            </Text>
            {settled.status === 'pending' ? (
              <Text style={styles.waiting}>
                Confirming on-chain, boarding into Ark…
              </Text>
            ) : null}
            <GhostButton onPress={() => onNavigate('home')}>Done</GhostButton>
          </View>
        </Band>
      ) : result ? (
        <Band tinted>
          <View style={styles.result}>
            <QRCode value={result} size={176} />
            <View style={styles.resultCopy}>
              <CopyRow
                label={isLn ? 'Invoice' : 'Boarding address'}
                value={result}
              />
            </View>
            <Text style={styles.waiting}>
              Waiting for payment. This updates automatically.
            </Text>
          </View>
        </Band>
      ) : null}
    </ScrollView>
  );
}
