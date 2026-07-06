import { useState } from 'react';
import { Text, View } from 'react-native';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GhostButton, PrimaryButton, TextLink } from '../../components/ui/Button';
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
  hint: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  divider: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    backgroundColor: p.border,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
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
  footer: {
    borderColor: p.border,
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 20,
  },
  footerRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
    justifyContent: 'center' as const,
  },
  footerText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
});

// Divider renders the hairline "or" separator between auth affordances.
function Divider({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

// CreateWalletScreen creates a fresh wallet (passkey or password) and offers
// the "already have a wallet?" affordances (unlock with passkey, restore from
// phrase). When leadWithUnlock is true the unlock affordance is promoted
// above the create form.
export function CreateWalletScreen({
  network,
  passkeySupported,
  leadWithUnlock,
  onCreate,
  onUnlockPasskey,
  onRestore,
  busy,
  error,
  passkeyBusy,
  passkeyError,
}: {
  network: string;
  passkeySupported: boolean;
  leadWithUnlock: boolean;
  onCreate: (args: { password: string; mode: WalletMode }) => void;
  onUnlockPasskey: () => void;
  onRestore: () => void;
  busy: boolean;
  error: string;
  passkeyBusy: boolean;
  passkeyError: string;
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

  const unlockButton = passkeySupported ? (
    <GhostButton
      icon={Fingerprint}
      onPress={onUnlockPasskey}
      disabled={anyBusy}
      busy={passkeyBusy}
    >
      {passkeyBusy ? 'Waiting for passkey…' : 'Unlock with passkey'}
    </GhostButton>
  ) : null;

  const unlockHint = (
    <Text style={styles.hint}>
      Opens a wallet you already created with this passkey on this or another
      device. It does not make a new one.
    </Text>
  );

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Create wallet"
        sub="Keys are generated and stored on this device."
      />

      {leadWithUnlock && unlockButton ? (
        <View style={styles.section}>
          {unlockButton}
          {unlockHint}
          <View style={{ marginTop: 8 }}>
            <InlineError message={passkeyError} />
          </View>
          <Divider label="or create a new wallet" />
        </View>
      ) : null}

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

        <View style={styles.keysNote}>
          <ShieldCheck size={13} color={palette.good} />
          <Text style={styles.keysNoteText}>
            On-device keys · nothing leaves this device.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        {!leadWithUnlock && unlockButton ? (
          <View style={styles.section}>
            <Divider label="already have a wallet?" />
            {unlockButton}
            {unlockHint}
            <View style={{ marginTop: 8 }}>
              <InlineError message={passkeyError} />
            </View>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>No passkey on this device? </Text>
          <TextLink onPress={onRestore}>Restore from recovery phrase</TextLink>
        </View>
      </View>
    </AuthLayout>
  );
}
