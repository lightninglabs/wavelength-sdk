import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  type LucideIcon,
  Monitor,
  Power,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react-native';
import {
  WalletKind,
  useWallet,
  useWalletInfo,
} from '@lightninglabs/wavelength-react';
import { GatewayFields } from '../../components/GatewayFields';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { CopyButton } from '../../components/ui/CopyButton';
import { Label } from '../../components/ui/Label';
import { Segmented } from '../../components/ui/Segmented';
import { SummaryRow } from '../../components/ui/SummaryRow';
import { formatSats, shortKey } from '../../lib/format';
import { statusLabel } from '../../lib/phase';
import { RuntimeFieldSetter, RuntimeForm } from '../../lib/runtime-config';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (p: Palette) => ({
  statGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: 16,
    rowGap: 16,
  },
  stat: {
    flexBasis: '50%' as const,
  },
  statHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 6,
  },
  statLabel: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  statValue: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 14,
    marginTop: 4,
  },
  statValueGood: {
    color: p.good,
  },
  identityRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    marginTop: 12,
  },
  identity: {
    color: p.text,
    flexShrink: 1,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  rows: {
    gap: 10,
    marginTop: 12,
  },
  appearanceRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 12,
  },
  appearanceLabel: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 10,
  },
  appearanceText: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  advancedHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 12,
  },
  advancedLabel: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  advancedText: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  advancedBody: {
    borderColor: p.border,
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  advancedHint: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  danger: {
    gap: 12,
    marginTop: 12,
  },
  dangerButton: {
    alignItems: 'center' as const,
    backgroundColor: p.badSoft,
    borderColor: p.bad,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dangerText: {
    color: p.bad,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
});

// SettingsScreen surfaces runtime status, identity, appearance, security,
// advanced gateway configuration, and the danger zone (stop + wipe).
export function SettingsScreen({
  form,
  onField,
  walletKind,
  onStop,
  onWipe,
  onNavigate,
}: {
  form: RuntimeForm;
  onField: RuntimeFieldSetter;
  walletKind: WalletKind | null;
  onStop: () => void;
  onWipe: () => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const { phase } = useWallet();
  const info = useWalletInfo();
  const phaseLabel = statusLabel(phase);
  const { theme, palette, setTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [advanced, setAdvanced] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const identity = info?.identityPubKey || '';
  const Chevron = advanced ? ChevronUp : ChevronDown;

  const runtime: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    good?: boolean;
  }> = [
    { icon: ShieldCheck, label: 'Phase', value: phaseLabel, good: true },
    { icon: Zap, label: 'Network', value: info?.network || '-' },
    { icon: Wallet, label: 'Wallet', value: info?.walletType || '-' },
    {
      icon: Server,
      label: 'Server',
      value: info?.serverConnected ? 'Connected' : 'Offline',
      good: info?.serverConnected,
    },
    {
      icon: Layers,
      label: 'Block height',
      value: info?.blockHeight ? formatSats(info.blockHeight) : '-',
    },
  ];

  return (
    <ScrollView>
      <PageHead
        title="Settings"
        subtitle="Identity, appearance, security and runtime"
        onBack={() => onNavigate('home')}
      />

      <Band>
        <Label>Runtime</Label>
        <View style={styles.statGrid}>
          {runtime.map((r) => (
            <View key={r.label} style={styles.stat}>
              <View style={styles.statHead}>
                <r.icon size={13} color={r.good ? palette.good : palette.muted} />
                <Text style={styles.statLabel}>{r.label}</Text>
              </View>
              <Text style={[styles.statValue, r.good && styles.statValueGood]}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>
      </Band>

      <Band tinted>
        <Label>Identity</Label>
        <View style={styles.identityRow}>
          <Text style={styles.identity}>
            {identity ? shortKey(identity, 10, 8) : '-'}
          </Text>
          {identity ? <CopyButton value={identity} /> : null}
        </View>
      </Band>

      <Band>
        <Label>About</Label>
        <View style={styles.rows}>
          <SummaryRow label="Version" value={info?.version || '-'} mono />
          <SummaryRow label="Commit" value={info?.commit || '-'} mono />
        </View>
      </Band>

      <Band tinted>
        <Label>Security</Label>
        <View style={styles.rows}>
          <SummaryRow
            label="Wallet type"
            value={
              walletKind === 'passkey'
                ? 'Passkey'
                : walletKind === 'password'
                  ? 'Password'
                  : 'Unknown'
            }
          />
        </View>
      </Band>

      <Band>
        <Label>Appearance</Label>
        <View style={styles.appearanceRow}>
          <View style={styles.appearanceLabel}>
            <Monitor size={16} color={palette.muted} />
            <Text style={styles.appearanceText}>Theme</Text>
          </View>
          <Segmented
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
      </Band>

      <Band tinted>
        <Label>Advanced</Label>
        <Pressable onPress={() => setAdvanced((v) => !v)} style={styles.advancedHead}>
          <View style={styles.advancedLabel}>
            <SettingsIcon size={15} color={palette.muted} />
            <Text style={styles.advancedText}>Network servers</Text>
          </View>
          <Chevron size={16} color={palette.muted} />
        </Pressable>
        {advanced ? (
          <View style={styles.advancedBody}>
            <Text style={styles.advancedHint}>
              Display only. The running configuration cannot be changed. Stop
              the runtime to reconnect with different servers.
            </Text>
            <GatewayFields form={form} onField={onField} disabled />
          </View>
        ) : null}
      </Band>

      <Band>
        <Label>Danger zone</Label>
        <View style={styles.danger}>
          <Pressable onPress={onStop} style={styles.dangerButton}>
            <Power size={16} color={palette.bad} />
            <Text style={styles.dangerText}>Stop runtime</Text>
          </Pressable>
          <Pressable onPress={() => setConfirmWipe(true)} style={styles.dangerButton}>
            <Trash2 size={16} color={palette.bad} />
            <Text style={styles.dangerText}>Clear wallet data</Text>
          </Pressable>
        </View>
      </Band>

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
    </ScrollView>
  );
}
