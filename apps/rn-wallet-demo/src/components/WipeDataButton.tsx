import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Palette, fonts } from '../theme/tokens';
import { useThemedStyles } from '../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    marginTop: 8,
  },
  text: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
    textDecorationLine: 'underline' as const,
  },
});

// WipeDataButton is the escape hatch offered on the pre-runtime screens. The
// settings screen only exists once the runtime is up, so a wallet whose stored
// data keeps the runtime from starting (a stale database, say) would otherwise
// trap the user with no way to clear it. It is a quiet text link, matching the
// unlock screen's "Start over" affordance: starting or retrying stays the only
// prominent action, and the confirmation carries the weight of the warning.
//
// `scope` picks the copy. Unlike the web demo, this button here backs two
// genuinely different operations: `"wallet"` (the default, used on
// ErrorScreen) wipes only the wallet currently in view, matching RN's
// per-wallet on-disk directories; `"all"` (used on WalletListScreen's footer)
// wipes every wallet's data on this device plus the registry. The copy must
// stay singular or plural to match, so it is never safe to hardcode one
// wording for both call sites.
const copy = {
  wallet: {
    label: 'Clear wallet data',
    title: 'Clear wallet data?',
    description:
      "This removes the wallet from this device's list, and it can no longer be opened here. Its data on this device is deleted too, so you would need its recovery phrase or passkey to set it up again. The exception is a wallet carried over from the single-wallet version of the app, whose data stays on disk until you use Clear all data.",
  },
  all: {
    label: 'Clear all data',
    title: 'Clear all data?',
    description:
      "This permanently deletes every wallet's data on this device, along with the wallet list. You can only get them back with a recovery phrase or passkey. This cannot be undone.",
  },
};

export function WipeDataButton({
  onWipe,
  scope = 'wallet',
}: {
  onWipe: () => void;
  scope?: 'wallet' | 'all';
}) {
  const styles = useThemedStyles(makeStyles);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const { label, title, description } = copy[scope];

  return (
    <View style={styles.row}>
      <Pressable onPress={() => setConfirmWipe(true)} hitSlop={8}>
        <Text style={styles.text}>{label}</Text>
      </Pressable>

      <ConfirmDialog
        open={confirmWipe}
        title={title}
        description={description}
        confirmLabel={scope === 'wallet' ? 'Remove wallet' : 'Clear everything'}
        destructive
        onConfirm={() => {
          setConfirmWipe(false);
          onWipe();
        }}
        onCancel={() => setConfirmWipe(false)}
      />
    </View>
  );
}
