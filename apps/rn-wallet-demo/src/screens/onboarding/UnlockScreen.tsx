import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fingerprint, KeyRound, RotateCcw } from 'lucide-react-native';
import {
  useWalletPasskey,
  useWalletUnlock,
} from '@lightninglabs/wavelength-react';
import type { WalletKind } from '@lightninglabs/wavelength-react';
import { passkeyCeremony } from '../../lib/passkeyCeremony';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GhostButton, PrimaryButton, TextLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { LoadingScreen } from './LoadingScreen';

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
// on PRF support, so it stays available even without a local marker. The
// passkey ceremony is held behind a loading screen so a synced wallet is
// never shown mid-biometric-prompt. credentialId (loaded by WalletApp) scopes
// the assertion to a known credential when one is on record.
export function UnlockScreen({
  network,
  walletKind,
  credentialId,
  onWalletUnlocked,
  onRecover,
  onWipe,
}: {
  network: string;
  walletKind: WalletKind | null;
  credentialId: string | null;
  onWalletUnlocked: (kind: WalletKind, credentialId?: string) => void;
  onRecover: () => void;
  onWipe: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const { unlock, unlockPending, unlockError } = useWalletUnlock();
  const passkey = useWalletPasskey(passkeyCeremony);
  const anyBusy = unlockPending || passkey.openPending;

  // Passkey support is still probing: hold on a loading screen rather than
  // flash a password-only form that would flip to passkey-first a moment
  // later. The probe is memoized and warmed at boot, so this rarely paints.
  if (passkey.supported === null) {
    return (
      <LoadingScreen
        network={network}
        title="Unlock wallet"
        sub="Checking device capabilities."
      />
    );
  }

  // The passkey option is offered whenever the device supports PRF and the
  // wallet is not explicitly a password wallet; an unknown marker still
  // permits a passkey attempt.
  const showPasskey = passkey.supported && walletKind !== 'password';
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

  async function onUnlock(pw: string) {
    try {
      await unlock({ password: pw });
    } catch {
      // Surfaced via unlockError.
      return;
    }
    // Outside the try: a throwing AsyncStorage write in onWalletUnlocked
    // must not be swallowed by unlock's own catch.
    onWalletUnlocked('password');
  }

  // onUnlockPasskey opens an existing passkey wallet, scoped to the stored
  // credential when one is known.
  async function onUnlockPasskey() {
    let outcome;
    try {
      outcome = await passkey.open(credentialId ?? undefined);
    } catch {
      // Surfaced via passkey.openError.
      return;
    }
    // Outside the try: a throwing AsyncStorage write in onWalletUnlocked
    // must not be swallowed by the passkey ceremony's own catch.
    onWalletUnlocked('passkey', outcome.credentialId);
  }

  // Passkey unlock in flight: hold on a loading screen instead of leaving the
  // unlock form visible underneath the biometric prompt.
  if (passkey.openPending) {
    return (
      <LoadingScreen
        network={network}
        title="Unlocking wallet"
        sub="Decrypting keys and syncing. This can take a few seconds."
      />
    );
  }

  return (
    <AuthLayout network={network}>
      <AuthHeader title="Unlock wallet" sub={sub} />

      {showPasskey ? (
        <View style={styles.passkeyBlock}>
          <GhostButton
            icon={Fingerprint}
            onPress={() => void onUnlockPasskey()}
            disabled={anyBusy}
          >
            Unlock with passkey
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
                void onUnlock(password);
              }
            }}
            busy={unlockPending}
            disabled={anyBusy || password.length === 0}
          >
            {unlockPending ? 'Unlocking…' : 'Unlock'}
          </PrimaryButton>
          {anyBusy ? (
            <Text style={styles.busyHint}>
              Decrypting keys and syncing. This can take a few seconds.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <InlineError
          message={unlockError?.message || passkey.openError?.message || ''}
        />
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
