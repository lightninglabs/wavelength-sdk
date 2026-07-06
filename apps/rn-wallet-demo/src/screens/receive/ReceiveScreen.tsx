import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Layers, Zap } from 'lucide-react-native';
import { ReceiveRequest } from '@lightninglabs/walletdk-react';
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
});

// ReceiveScreen offers a Lightning invoice (amount + memo) or an on-chain
// boarding address, each paired with a scannable QR. Values come from the
// live receive()/deposit() calls.
export function ReceiveScreen({
  onNavigate,
  onReceive,
  onDeposit,
  receiveBusy,
  receiveError,
  depositBusy,
  depositError,
}: {
  onNavigate: (tab: AppTab) => void;
  onReceive: (req: ReceiveRequest) => Promise<string>;
  onDeposit: () => Promise<string>;
  receiveBusy: boolean;
  receiveError: string;
  depositBusy: boolean;
  depositError: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<Tab>('lightning');
  const [amount, setAmount] = useState('1000');
  const [memo, setMemo] = useState('');
  const [invoice, setInvoice] = useState('');
  const [address, setAddress] = useState('');
  const [localError, setLocalError] = useState('');

  const isLn = tab === 'lightning';
  // The QR block only appears once a value has been generated.
  const result = isLn ? invoice : address;

  async function createInvoice() {
    setLocalError('');
    try {
      setInvoice(
        await onReceive({
          amountSat: Number(amount) || 0,
          memo: memo || undefined,
        }),
      );
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  async function getAddress() {
    setLocalError('');
    try {
      setAddress(await onDeposit());
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <PageHead
        title="Receive"
        subtitle="Share an invoice or boarding address"
        onBack={() => onNavigate('home')}
      />

      <Band>
        <Label>Method</Label>
        <View style={{ marginTop: 12 }}>
          <Segmented
            value={tab}
            onChange={(next) => {
              // Clear the local error so an invoice failure does not linger
              // under the on-chain tab (and vice versa).
              setLocalError('');
              setTab(next);
            }}
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
            <PrimaryButton icon={Zap} onPress={() => void createInvoice()} busy={receiveBusy}>
              {receiveBusy
                ? 'Creating invoice…'
                : invoice
                  ? 'Create another'
                  : 'Create invoice'}
            </PrimaryButton>
          ) : address ? (
            <GhostButton onPress={() => onNavigate('home')}>Done</GhostButton>
          ) : (
            <PrimaryButton icon={Layers} onPress={() => void getAddress()} busy={depositBusy}>
              {depositBusy ? 'Generating…' : 'Get boarding address'}
            </PrimaryButton>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <InlineError
            message={localError || (isLn ? receiveError : depositError)}
          />
        </View>
      </Band>

      {result ? (
        <Band tinted>
          <View style={styles.result}>
            <QRCode value={result} size={176} />
            <View style={styles.resultCopy}>
              <CopyRow
                label={isLn ? 'Invoice' : 'Boarding address'}
                value={result}
              />
            </View>
          </View>
        </Band>
      ) : null}
    </ScrollView>
  );
}
