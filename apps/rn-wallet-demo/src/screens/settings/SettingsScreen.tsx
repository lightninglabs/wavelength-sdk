import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  LogOut,
  type LucideIcon,
  Monitor,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react-native';
import { useWallet, useWalletInfo } from '@lightninglabs/wavelength-react';
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
import { WalletEntry } from '../../lib/walletRegistry';
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
    color: p.lime,
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
  walletRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 12,
  },
  walletIconBox: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    backgroundColor: p.well,
    height: 40,
    justifyContent: 'center' as const,
    width: 40,
  },
  walletBody: {
    flex: 1,
    gap: 4,
  },
  walletNameRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 8,
  },
  walletName: {
    color: p.text,
    flexShrink: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  networkChip: {
    borderColor: p.border,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  networkChipText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
  },
  walletCreated: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  switchButton: {
    alignItems: 'center' as const,
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  switchButtonText: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
  },
  entry: {
    alignItems: 'center' as const,
    backgroundColor: p.surfaceAlt,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  entryBody: {
    flex: 1,
  },
  entryTitle: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
  },
  entrySubtitle: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
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

// createdLabel renders a wallet entry's creation timestamp as a short date.
function createdLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// SettingsScreen surfaces this wallet's identity, runtime status, appearance,
// wallet-type security, advanced gateway configuration, build version and
// the wallet-management actions (switch, delete).
export function SettingsScreen({
  entry,
  onSwitchWallet,
  onDeleteWallet,
  onNavigate,
}: {
  entry: WalletEntry;
  onSwitchWallet: () => void;
  onDeleteWallet: () => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const { phase } = useWallet();
  const info = useWalletInfo();
  const phaseLabel = statusLabel(phase);
  const { theme, palette, setTheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [advanced, setAdvanced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const identity = info?.identityPubKey || '';
  const Chevron = advanced ? ChevronUp : ChevronDown;

  // A row's `tone` colors its stat icon with the accent matching the stat's
  // domain (sky network, teal wallet identity, orange chain height),
  // mirroring the Overview runtime strip; `good` rows read fully in lime
  // instead.
  const runtime: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    good?: boolean;
    tone?: string;
  }> = [
    { icon: ShieldCheck, label: 'Phase', value: phaseLabel, good: true },
    { icon: Zap, label: 'Network', value: info?.network || '-', tone: palette.sky },
    {
      icon: Wallet,
      label: 'Wallet',
      value: info?.walletType || '-',
      tone: palette.teal,
    },
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
      tone: palette.orange,
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
        <Label accent="violet" rule>
          This wallet
        </Label>
        <View style={styles.walletRow}>
          <View style={styles.walletIconBox}>
            <Wallet size={17} color={palette.muted} />
          </View>
          <View style={styles.walletBody}>
            <View style={styles.walletNameRow}>
              <Text style={styles.walletName} numberOfLines={1}>
                {entry.name}
              </Text>
              <View style={styles.networkChip}>
                <Text style={styles.networkChipText}>
                  {entry.network ?? 'unknown'}
                </Text>
              </View>
            </View>
            <Text style={styles.walletCreated}>
              Created {createdLabel(entry.createdAt)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Switch wallet"
            accessibilityRole="button"
            onPress={onSwitchWallet}
            style={styles.switchButton}
          >
            <ArrowLeftRight size={16} color={palette.text} />
            <Text style={styles.switchButtonText}>Switch wallet</Text>
          </Pressable>
        </View>
      </Band>

      <Band tinted>
        <Label accent="teal" rule>
          Runtime
        </Label>
        <View style={styles.statGrid}>
          {runtime.map((r) => (
            <View key={r.label} style={styles.stat}>
              <View style={styles.statHead}>
                <r.icon
                  size={13}
                  color={r.good ? palette.lime : (r.tone ?? palette.muted)}
                />
                <Text style={styles.statLabel}>{r.label}</Text>
              </View>
              <Text style={[styles.statValue, r.good && styles.statValueGood]}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>
      </Band>

      <Band>
        <Label accent="lime" rule>
          Identity
        </Label>
        <View style={styles.identityRow}>
          <Text style={styles.identity}>
            {identity ? shortKey(identity, 10, 8) : '-'}
          </Text>
          {identity ? <CopyButton value={identity} /> : null}
        </View>
      </Band>

      <Band tinted>
        <Label rule>About</Label>
        <View style={styles.rows}>
          <SummaryRow label="Version" value={info?.version || '-'} mono />
          <SummaryRow label="Commit" value={info?.commit || '-'} mono />
        </View>
      </Band>

      <Band>
        <Label accent="sky" rule>
          Security
        </Label>
        <View style={styles.rows}>
          <SummaryRow
            label="Wallet type"
            value={
              entry.walletKind === 'passkey'
                ? 'Passkey'
                : entry.walletKind === 'password'
                  ? 'Password'
                  : 'Unknown'
            }
          />
        </View>
      </Band>

      <Band tinted>
        <Label rule>Appearance</Label>
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

      <Band>
        <Label rule>Advanced</Label>
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
              Display only. This is the configuration the wallet was created
              with; it cannot be changed after the fact.
            </Text>
            <GatewayFields endpoints={entry.endpoints} dataDir={entry.dataDir} />
          </View>
        ) : null}
      </Band>

      <Band tinted>
        <Label rule>Danger zone</Label>
        <Pressable
          accessibilityLabel="Emergency exit"
          accessibilityRole="button"
          onPress={() => onNavigate('exit')}
          style={styles.entry}
        >
          <LogOut size={16} color={palette.muted} />
          <View style={styles.entryBody}>
            <Text style={styles.entryTitle}>Emergency exit</Text>
            <Text style={styles.entrySubtitle}>Recover your funds on-chain</Text>
          </View>
          <ChevronRight size={16} color={palette.muted} />
        </Pressable>
        <View style={styles.danger}>
          <Pressable onPress={() => setConfirmDelete(true)} style={styles.dangerButton}>
            <Trash2 size={16} color={palette.bad} />
            <Text style={styles.dangerText}>Delete this wallet</Text>
          </Pressable>
        </View>
      </Band>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this wallet?"
        description="This deletes the wallet's data from this device and removes it from the list."
        confirmLabel="Delete wallet"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          onDeleteWallet();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScrollView>
  );
}
