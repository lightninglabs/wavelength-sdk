import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fingerprint, KeyRound, RotateCcw } from 'lucide-react-native';
import type { WalletKind } from '@lightninglabs/walletdk-react';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GhostButton, PrimaryButton, TextLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  passkeyBlock: {
    gap: 16,
    marginBottom: 16,
  },
  divider: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
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
  form: {
    gap: 16,
  },
  busyHint: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    textAlign: 'center' as const,
  },
  recoverRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
    justifyContent: 'center' as const,
    marginTop: 20,
  },
  recoverText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  wipeRow: {
    alignItems: 'center' as const,
    marginTop: 8,
  },
  wipeText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
    textDecorationLine: 'underline' as const,
  },
});

// UnlockScreen serves the `locked` phase: a wallet exists on this device and
// must be unlocked. A passkey wallet unlocks with the platform authenticator;
// a password wallet uses its password. The passkey affordance is gated only
// on PRF support, so it stays available even without a local marker.
export function UnlockScreen({
  network,
  passkeySupported,
  walletKind,
  onUnlock,
  onUnlockPasskey,
  onRecover,
  onWipe,
  busy,
  error,
  passkeyBusy,
  passkeyError,
}: {
  network: string;
  passkeySupported: boolean;
  walletKind: WalletKind | null;
  onUnlock: (password: string) => void;
  onUnlockPasskey: () => void;
  onRecover: () => void;
  onWipe: () => void;
  busy: boolean;
  error: string;
  passkeyBusy: boolean;
  passkeyError: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const anyBusy = busy || passkeyBusy;

  // The passkey option is offered whenever the device supports PRF and the
  // wallet is not explicitly a password wallet; an unknown marker still
  // permits a passkey attempt.
  const showPasskey = passkeySupported && walletKind !== 'password';
  const showPassword =
    walletKind === 'password' || (!showPasskey && walletKind === null);

  // The subtitle names only the methods actually offered.
  const sub =
    showPasskey && showPassword
      ? 'Unlock with your passkey or password to sync the wallet.'
      : showPasskey
        ? 'Unlock with your passkey to sync the wallet.'
        : showPassword
          ? 'Unlock with your password to sync the wallet.'
          : 'Unlock to sync the wallet.';

  return (
    <AuthLayout network={network}>
      <AuthHeader title="Unlock wallet" sub={sub} />

      {showPasskey ? (
        <View style={styles.passkeyBlock}>
          <GhostButton
            icon={Fingerprint}
            onPress={onUnlockPasskey}
            disabled={anyBusy}
            busy={passkeyBusy}
          >
            {passkeyBusy ? 'Waiting for passkey…' : 'Unlock with passkey'}
          </GhostButton>
          {showPassword ? (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or use password</Text>
              <View style={styles.dividerLine} />
            </View>
          ) : null}
        </View>
      ) : null}

      {showPassword ? (
        <View style={styles.form}>
          <Field
            label="Password"
            secure
            placeholder="••••••••••"
            value={password}
            onChange={setPassword}
          />
          <PrimaryButton
            icon={KeyRound}
            onPress={() => {
              if (!anyBusy && password.length > 0) {
                onUnlock(password);
              }
            }}
            busy={busy}
            disabled={anyBusy || password.length === 0}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </PrimaryButton>
          {anyBusy ? (
            <Text style={styles.busyHint}>
              Decrypting keys and syncing. This can take a few seconds.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <InlineError message={error || passkeyError} />
      </View>

      <View style={styles.recoverRow}>
        <RotateCcw size={13} color={palette.faint} />
        <Text style={styles.recoverText}>Lost access?</Text>
        <TextLink onPress={onRecover}>Recover with phrase</TextLink>
      </View>

      <View style={styles.wipeRow}>
        <Pressable onPress={() => setConfirmWipe(true)} hitSlop={8}>
          <Text style={styles.wipeText}>Start over (clear all data)</Text>
        </Pressable>
      </View>

      <ConfirmDialog
        open={confirmWipe}
        title="Clear wallet data?"
        description="This permanently deletes the wallet and all data stored on this device. You will need your recovery phrase or passkey to restore your wallet. This cannot be undone."
        confirmLabel="Clear everything"
        destructive
        onConfirm={() => {
          setConfirmWipe(false);
          onWipe();
        }}
        onCancel={() => setConfirmWipe(false)}
      />
    </AuthLayout>
  );
}
