import { useState } from 'react';
import { Text, View } from 'react-native';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { PrimaryButton, TextLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import {
  WalletMode,
  WalletTypePicker,
} from '../../components/ui/WalletTypePicker';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  section: {
    marginBottom: 24,
  },
  pickerTitle: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  pickerSub: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: 4,
  },
  form: {
    gap: 16,
  },
  keysNote: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  keysNoteText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  restoreFailure: {
    gap: 6,
    marginTop: 20,
  },
  backRow: {
    alignItems: 'center' as const,
    marginTop: 20,
  },
});

// CreateWalletScreen creates a fresh wallet (a passkey wallet or a password
// wallet) for this registry entry. Restoring an existing wallet is a
// separate entry point, chosen from the wallet list before the runtime
// starts, so this screen only ever creates.
export function CreateWalletScreen({
  network,
  passkeySupported,
  onCreate,
  onBack,
  busy,
  error,
  passkeyBusy,
  passkeyError,
  restoreFailure,
  onDismissRestoreFailure,
}: {
  network: string;
  passkeySupported: boolean;
  onCreate: (args: { password: string; mode: WalletMode }) => void;
  /** Stops the runtime and returns to the wallet list. */
  onBack: () => void;
  busy: boolean;
  error: string;
  passkeyBusy: boolean;
  passkeyError: string;
  /** A restore that failed before the wallet came up, or empty when none. */
  restoreFailure?: string;
  /** Dismisses the restore-failure message. */
  onDismissRestoreFailure?: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Default to a passkey wallet when supported; otherwise password is the
  // only option.
  const [walletMode, setWalletMode] = useState<WalletMode>(
    passkeySupported ? 'passkey' : 'password',
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // A passkey wallet derives its DB password, so the password fields are
  // hidden and do not gate submission.
  const passkeyCreate = walletMode === 'passkey';
  const passwordOk = password.length > 0 && password === confirm;
  const anyBusy = busy || passkeyBusy;
  const canSubmit = passkeyCreate ? !anyBusy : !anyBusy && passwordOk;

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Create wallet"
        sub="Keys are generated and stored on this device."
      />

      {passkeySupported ? (
        <View style={styles.section}>
          <Text style={styles.pickerTitle}>
            How do you want to secure this wallet?
          </Text>
          <Text style={styles.pickerSub}>
            Pick one. You can always restore from your recovery phrase later.
          </Text>
          <WalletTypePicker value={walletMode} onChange={setWalletMode} />
        </View>
      ) : null}

      <View style={styles.form}>
        {!passkeyCreate ? (
          <>
            <Field
              label="Password"
              secure
              placeholder="••••••••••"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="Confirm password"
              secure
              placeholder="••••••••••"
              value={confirm}
              onChange={setConfirm}
            />
          </>
        ) : null}

        <PrimaryButton
          icon={passkeyCreate ? Fingerprint : KeyRound}
          onPress={() => {
            if (canSubmit) {
              onCreate({ password, mode: walletMode });
            }
          }}
          disabled={!canSubmit}
          busy={busy}
        >
          {busy
            ? 'Creating wallet…'
            : passkeyCreate
              ? 'Create passkey wallet'
              : 'Create wallet'}
        </PrimaryButton>
        <InlineError message={error} />
        <InlineError message={passkeyError} />

        <View style={styles.keysNote}>
          <ShieldCheck size={13} color={palette.good} />
          <Text style={styles.keysNoteText}>
            On-device keys · nothing leaves this device.
          </Text>
        </View>
      </View>

      {restoreFailure ? (
        <View style={styles.restoreFailure}>
          <InlineError message={restoreFailure} />
          <TextLink onPress={onDismissRestoreFailure}>Dismiss</TextLink>
        </View>
      ) : null}

      {/* Suppressed while a create is in flight so the runtime is never torn
          down underneath a mid-flight daemon call. */}
      {!anyBusy ? (
        <View style={styles.backRow}>
          <TextLink onPress={onBack}>Back to wallets</TextLink>
        </View>
      ) : null}
    </AuthLayout>
  );
}
