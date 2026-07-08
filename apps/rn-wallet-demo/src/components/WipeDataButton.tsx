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
export function WipeDataButton({ onWipe }: { onWipe: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [confirmWipe, setConfirmWipe] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable onPress={() => setConfirmWipe(true)} hitSlop={8}>
        <Text style={styles.text}>Clear wallet data</Text>
      </Pressable>

      <ConfirmDialog
        open={confirmWipe}
        title="Clear wallet data?"
        description="This permanently deletes the wallet and all data stored on this device. You can only get it back with your recovery phrase or passkey. This cannot be undone."
        confirmLabel="Clear everything"
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
