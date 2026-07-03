import { Modal, Pressable, Text, View } from 'react-native';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GhostButton } from './Button';

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
    maxWidth: 384,
    padding: 24,
    width: '100%' as const,
  },
  hairline: {
    backgroundColor: p.accent,
    height: 1,
    left: 0,
    position: 'absolute' as const,
    right: 0,
    top: 0,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
  },
  description: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
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
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  confirmAccent: {
    backgroundColor: p.accent,
  },
  confirmDanger: {
    backgroundColor: p.bad,
  },
  confirmText: {
    color: '#ffffff',
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
});

// ConfirmDialog asks the user to confirm or cancel an action in a modal. When
// destructive it renders the confirm action with the danger treatment. A 1 px
// accent hairline across the card top is the dialog's quiet signature.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.hairline} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <GhostButton onPress={onCancel} disabled={busy}>
                {cancelLabel}
              </GhostButton>
            </View>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={[
                styles.action,
                styles.confirm,
                destructive ? styles.confirmDanger : styles.confirmAccent,
                busy && styles.disabled,
              ]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
