import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { FORCE_UNROLL_ACK } from '@lightninglabs/wavelength-react';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { Field } from '../ui/Field';
import { GhostButton } from '../ui/Button';

const makeStyles = (p: Palette) => ({
  backdrop: {
    alignItems: 'center' as const,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flex: 1,
    justifyContent: 'center' as const,
    padding: 16,
  },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderWidth: 1,
    maxWidth: 400,
    padding: 24,
    width: '100%' as const,
  },
  // A bad-toned hairline across the card top escalates this beyond the ordinary
  // accent-signed confirm dialog: this gate guards an irreversible action.
  hairline: {
    backgroundColor: p.bad,
    height: 2,
    left: 0,
    position: 'absolute' as const,
    right: 0,
    top: 0,
  },
  head: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 12,
  },
  badge: {
    alignItems: 'center' as const,
    backgroundColor: p.badSoft,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
  },
  eyebrow: {
    color: p.bad,
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: 'uppercase' as const,
  },
  costs: {
    backgroundColor: p.badSoft,
    borderColor: p.bad,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 14,
  },
  costText: {
    color: p.text,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  field: {
    marginTop: 20,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 24,
  },
  action: {
    flex: 1,
  },
  confirm: {
    alignItems: 'center' as const,
    backgroundColor: p.bad,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  confirmText: {
    color: '#ffffff',
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.4,
  },
});

// ExitAckDialog is the last gate before a unilateral exit. It guards an
// irreversible, expensive on-chain action, so it carries deliberately more
// visual weight than an ordinary confirm: a danger badge and bad-toned panel
// spelling out the cost, and a type-to-confirm field that arms the action only
// on an exact match of the acknowledgement phrase.
export function ExitAckDialog({
  open,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [typed, setTyped] = useState('');
  const armed = typed === FORCE_UNROLL_ACK;
  const off = !armed || busy;

  // This component stays mounted for the whole ExitScreen lifetime (Modal only
  // gates visibility of its children, not this component), so the typed phrase
  // must be cleared explicitly on every close. Without this, a second
  // unilateral exit would reopen with the phrase already filled in and the
  // confirm button already armed, defeating the deliberate-friction gate.
  useEffect(() => {
    if (!open) {
      setTyped('');
    }
  }, [open]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={styles.card}
          onPress={() => undefined}
          testID="exit-ack-dialog"
          accessibilityLabel="Confirm unilateral exit"
        >
          <View style={styles.hairline} />
          <View style={styles.head}>
            <View style={styles.badge}>
              <ShieldAlert size={18} color={palette.bad} />
            </View>
            <View>
              <Text style={styles.title}>Force unilateral exit</Text>
              <Text style={styles.eyebrow}>This cannot be undone</Text>
            </View>
          </View>

          <View style={styles.costs}>
            <Text style={styles.costText}>
              Your funds are pushed on-chain, out of the shared protocol.
            </Text>
            <Text style={styles.costText}>
              The exit takes hours to days to finish as timelocks mature and
              transactions confirm.
            </Text>
            <Text style={styles.costText}>
              On-chain fees are paid from the backing wallet and are not
              recoverable.
            </Text>
          </View>

          <View style={styles.field}>
            <Field
              label={`Type ${FORCE_UNROLL_ACK} to confirm`}
              value={typed}
              onChange={setTyped}
              mono
            />
          </View>

          <View style={styles.actions}>
            <View style={styles.action}>
              <GhostButton onPress={onCancel} disabled={busy}>
                Cancel
              </GhostButton>
            </View>
            <Pressable
              testID="exit-ack-confirm"
              onPress={onConfirm}
              disabled={off}
              accessibilityRole="button"
              accessibilityState={{ disabled: off }}
              style={[styles.action, styles.confirm, off && styles.disabled]}
            >
              <Text style={styles.confirmText}>
                {busy ? 'Starting…' : 'Force unilateral exit'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
