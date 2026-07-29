import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fingerprint, KeyRound, Plus, Wallet } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { WipeDataButton } from '../../components/WipeDataButton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PrimaryButton, TextLink } from '../../components/ui/Button';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import type { WalletEntry } from '../../lib/walletRegistry';

// relativeTime renders a millisecond epoch as a short "last used" line. It
// only needs coarse buckets (this is a device-local list, not an audit log),
// so it steps through unit widths rather than pulling in a formatting library.
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) {
    return 'just now';
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const makeStyles = (p: Palette) => ({
  list: {
    gap: 8,
    marginBottom: 8,
  },
  row: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    backgroundColor: p.surfaceAlt,
    flexDirection: 'row' as const,
    gap: 12,
    padding: 12,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  iconBox: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    backgroundColor: p.well,
    height: 40,
    justifyContent: 'center' as const,
    width: 40,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  name: {
    color: p.text,
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  badge: {
    borderColor: p.warn,
    borderWidth: 1,
    backgroundColor: p.warnSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: p.warn,
    fontFamily: fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  metaRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  chip: {
    borderColor: p.border,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  lastUsed: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  hint: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 11,
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  actions: {
    gap: 12,
  },
  link: {
    alignItems: 'center' as const,
  },
});

// WalletListScreen serves as the app's front door whenever more than zero
// wallets are registered: it never starts the runtime (the registry is plain
// AsyncStorage), so it can render before any daemon round trip.
export function WalletListScreen({
  wallets,
  onOpen,
  onCreate,
  onRestore,
  onRemove,
  onWipeAll,
  busy,
}: {
  wallets: WalletEntry[];
  onOpen: (entry: WalletEntry) => void;
  onCreate: () => void;
  onRestore: () => void;
  onRemove: (entry: WalletEntry) => void;
  // Not part of the Task 2 brief's prop table; added because the brief also
  // calls for a footer WipeDataButton, and WipeDataButton always needs a real
  // onWipe callback. Task 3 wires this to clearing the whole registry plus
  // every wallet's on-disk directory.
  onWipeAll: () => void;
  busy: boolean;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [removing, setRemoving] = useState<WalletEntry | null>(null);

  return (
    <AuthLayout network="wallets">
      <AuthHeader
        title="Your wallets"
        sub="Every wallet lives on this device only. Pick one to unlock, or add another."
      />

      {wallets.length > 0 ? (
        <>
          <View style={styles.list}>
            {wallets.map((entry) => {
              const KindIcon =
                entry.walletKind === 'passkey'
                  ? Fingerprint
                  : entry.walletKind === 'password'
                    ? KeyRound
                    : Wallet;

              return (
                <Pressable
                  key={entry.id}
                  accessibilityLabel={entry.name}
                  accessibilityRole="button"
                  onPress={() => onOpen(entry)}
                  onLongPress={() => setRemoving(entry)}
                  delayLongPress={600}
                  disabled={busy}
                  style={[styles.row, busy && styles.rowDisabled]}
                >
                  <View style={styles.iconBox}>
                    <KindIcon size={17} color={palette.muted} />
                  </View>
                  <View style={styles.body}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      {entry.walletKind === null ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>unfinished</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>
                          {entry.network ?? 'choose network'}
                        </Text>
                      </View>
                      <Text style={styles.lastUsed}>
                        {relativeTime(entry.lastUsedAt)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>Hold a wallet to remove it.</Text>
        </>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton icon={Plus} onPress={onCreate} disabled={busy}>
          Create new wallet
        </PrimaryButton>
        <View style={styles.link}>
          <TextLink onPress={onRestore}>Restore a wallet</TextLink>
        </View>
      </View>

      <WipeDataButton onWipe={onWipeAll} />

      <ConfirmDialog
        open={removing !== null}
        title="Remove this wallet?"
        description="This deletes the wallet's data on this device. There is no undo; you would need its recovery phrase or passkey to set it up again."
        confirmLabel="Remove wallet"
        destructive
        onConfirm={() => {
          if (removing) {
            onRemove(removing);
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </AuthLayout>
  );
}
