import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  ChevronRight,
  Layers,
  Lock,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react-native';
import {
  Balance,
  Entry,
  WalletInfo,
  useWallet,
  useWalletActivity,
  useWalletBalance,
  useWalletDeposit,
  useWalletInfo,
  useWalletRefresh,
} from '@lightninglabs/wavelength-react';
import { ActivityRow } from '../../components/ActivityRow';
import { PageHead } from '../../components/layout/PageHead';
import { AppTab } from '../../components/layout/nav';
import { Band } from '../../components/ui/Band';
import { GhostButton, PrimaryButton } from '../../components/ui/Button';
import { CopyRow } from '../../components/ui/CopyRow';
import { InlineError } from '../../components/ui/InlineError';
import { Label } from '../../components/ui/Label';
import { QRCode } from '../../components/ui/QRCode';
import { Spinner } from '../../components/ui/Spinner';
import {
  balanceSat,
  hasAnyValue,
  pendingInSat,
  pendingOutSat,
} from '../../lib/balance';
import { errorMessage } from '../../lib/errors';
import { formatBtc, formatSats } from '../../lib/format';
import { statusLabel } from '../../lib/phase';
import { usePollWhileWaiting } from '../../lib/usePollWhileWaiting';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { Composition } from './Composition';
import { OnChainBalance } from './OnChainBalance';

const makeStyles = (p: Palette) => ({
  heroHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
  },
  selfCustody: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  selfCustodyDot: {
    backgroundColor: p.good,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  selfCustodyText: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  amountRow: {
    alignItems: 'baseline' as const,
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 8,
  },
  amount: {
    color: p.text,
    fontFamily: fonts.monoMedium,
    fontSize: 40,
    letterSpacing: -1,
  },
  amountUnit: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  subRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 6,
  },
  subBtc: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  subIn: {
    color: p.sky,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  subOut: {
    color: p.orange,
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 20,
  },
  action: {
    flex: 1,
  },
  refresh: {
    alignItems: 'center' as const,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  bandHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  viewAll: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 4,
  },
  viewAllText: {
    color: p.accent,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  list: {
    borderColor: p.border,
    borderTopWidth: 1,
    marginTop: 8,
  },
  listDivider: {
    borderColor: p.border,
    borderTopWidth: 1,
  },
  emptyList: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: 'center' as const,
  },
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
  emptyWrap: {
    alignItems: 'center' as const,
  },
  emptyIcon: {
    alignItems: 'center' as const,
    backgroundColor: p.skySoft,
    height: 56,
    justifyContent: 'center' as const,
    width: 56,
  },
  emptyTitle: {
    color: p.text,
    fontFamily: fonts.sansSemiBold,
    fontSize: 20,
    marginTop: 20,
  },
  emptyCopy: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center' as const,
  },
  emptyQr: {
    alignItems: 'center' as const,
    gap: 16,
    marginTop: 24,
    width: '100%' as const,
  },
  emptyAction: {
    marginTop: 24,
    width: '100%' as const,
  },
  lightningLink: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    marginTop: 16,
  },
  steps: {
    gap: 16,
    marginTop: 16,
  },
  step: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  stepBadge: {
    alignItems: 'center' as const,
    height: 24,
    justifyContent: 'center' as const,
    width: 24,
  },
  stepBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
  },
  stepText: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
});

// HomeScreen is the authenticated overview: the balance hero with
// composition, recent activity, and runtime status. A zero-value wallet swaps
// the dashboard for a board-on-chain CTA (the primary way to fund a fresh
// wallet; a Lightning invoice is also offered). Balance, activity, info,
// deposit and refresh are all self-served from the provider; only tab
// routing comes from the caller.
export function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: AppTab) => void;
}) {
  const { phase } = useWallet();
  const info = useWalletInfo();
  const phaseLabel = statusLabel(phase);
  const balance = useWalletBalance();
  const activity = useWalletActivity();
  const { deposit, depositPending, depositError } = useWalletDeposit();
  const { refresh, refreshPending, refreshError } = useWalletRefresh();

  const onDeposit = useCallback(
    () => deposit().then((result) => result.address),
    [deposit],
  );
  const onRefresh = useCallback(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  // A null balance with no activity means the first refresh has not landed yet
  // (the provider flips to 'ready' before the balance resolves, and a failed
  // refresh leaves it null). Render a loading state rather than the empty
  // wallet CTA, so a funded wallet never flashes "fund your wallet".
  const loading = balance === null && activity.length === 0;
  // Value comes from the balance, history from the activity: never mixed.
  const funded = hasAnyValue(balance) || activity.length > 0;

  return (
    <ScrollView>
      <PageHead
        title="Overview"
        subtitle="Your self-custodial wallet balance and pending flows."
        accent="violet"
      />
      {loading ? (
        <LoadingBalance />
      ) : funded ? (
        <>
          <BalanceBand
            balance={balance}
            onNavigate={onNavigate}
            onRefresh={onRefresh}
            refreshBusy={refreshPending}
            refreshError={refreshError?.message ?? ''}
          />
          <Band>
            <Label accent="teal" rule>
              Balance composition
            </Label>
            <View style={{ marginTop: 16 }}>
              <Composition balance={balance} />
              <OnChainBalance balance={balance} />
            </View>
          </Band>
          <RecentActivityBand activity={activity} onNavigate={onNavigate} />
          <RuntimeBand info={info} phaseLabel={phaseLabel} />
        </>
      ) : (
        <EmptyWallet
          info={info}
          phaseLabel={phaseLabel}
          onNavigate={onNavigate}
          onDeposit={onDeposit}
          depositBusy={depositPending}
          depositError={depositError?.message ?? ''}
        />
      )}
    </ScrollView>
  );
}

// LoadingBalance holds the overview while the first balance fetch is in flight,
// so a funded wallet is never shown the empty-wallet CTA on the ready
// transition.
function LoadingBalance() {
  const { palette } = useTheme();

  return (
    <Band tinted>
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
        <Spinner />
        <Text
          style={{ color: palette.muted, fontFamily: fonts.sans, fontSize: 14 }}
        >
          Loading your balance…
        </Text>
      </View>
    </Band>
  );
}

// BalanceBand is the Home hero: spendable balance, derived BTC, pending flow,
// and the primary Send / Receive actions.
function BalanceBand({
  balance,
  onNavigate,
  onRefresh,
  refreshBusy,
  refreshError,
}: {
  balance: Balance | null;
  onNavigate: (t: AppTab) => void;
  onRefresh: () => void;
  refreshBusy: boolean;
  refreshError: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const amount = balanceSat(balance);
  const incoming = pendingInSat(balance);
  const outgoing = pendingOutSat(balance);

  return (
    <Band tinted>
      <View style={styles.heroHead}>
        <View style={styles.selfCustody}>
          <View style={styles.selfCustodyDot} />
          <Text style={styles.selfCustodyText}>Self-custody</Text>
        </View>
        <Pressable
          onPress={onRefresh}
          disabled={refreshBusy}
          style={styles.refresh}
          accessibilityLabel="Refresh"
        >
          <RefreshCw
            size={16}
            color={refreshBusy ? palette.faint : palette.muted}
          />
        </Pressable>
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatSats(amount)}</Text>
        <Text style={styles.amountUnit}>sats</Text>
      </View>
      <View style={styles.subRow}>
        <Text style={styles.subBtc}>{formatBtc(amount)} BTC</Text>
        {incoming > 0 ? (
          <Text style={styles.subIn}>+{formatSats(incoming)} incoming</Text>
        ) : null}
        {outgoing > 0 ? (
          <Text style={styles.subOut}>-{formatSats(outgoing)} outgoing</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <PrimaryButton icon={ArrowUpRight} onPress={() => onNavigate('send')}>
            Send
          </PrimaryButton>
        </View>
        <View style={styles.action}>
          <GhostButton icon={ArrowDownLeft} onPress={() => onNavigate('receive')}>
            Receive
          </GhostButton>
        </View>
      </View>
      {refreshError ? (
        <View style={{ marginTop: 12 }}>
          <InlineError message={refreshError} />
        </View>
      ) : null}
    </Band>
  );
}

// RuntimeBand surfaces live runtime telemetry and self-custody cues as a
// two-column stat grid.
function RuntimeBand({
  info,
  phaseLabel,
}: {
  info: WalletInfo | null;
  phaseLabel: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // A row's `tone` colors its stat icon with the accent matching the stat's
  // domain (sky network, orange chain height, teal wallet identity); `good`
  // rows read fully in lime instead.
  const rows: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    good?: boolean;
    tone?: string;
  }> = [
    { icon: ShieldCheck, label: 'Runtime', value: phaseLabel, good: true },
    { icon: Zap, label: 'Network', value: info?.network || '-', tone: palette.sky },
    {
      icon: Layers,
      label: 'Block height',
      value: info?.blockHeight ? formatSats(info.blockHeight) : '-',
      tone: palette.orange,
    },
    {
      icon: Wallet,
      label: 'Wallet',
      value: info?.walletType || '-',
      tone: palette.teal,
    },
    { icon: Lock, label: 'Keys', value: 'On this device', good: true },
  ];

  return (
    <Band>
      <Label accent="violet" rule>
        Runtime & security
      </Label>
      <View style={styles.statGrid}>
        {rows.map((r) => (
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
  );
}

// EmptyWallet is the zero-balance state: it boards on-chain funds, fetching a
// boarding address on demand and showing it with a scannable QR.
function EmptyWallet({
  info,
  phaseLabel,
  onNavigate,
  onDeposit,
  depositBusy,
  depositError,
}: {
  info: WalletInfo | null;
  phaseLabel: string;
  onNavigate: (t: AppTab) => void;
  onDeposit: () => Promise<string>;
  depositBusy: boolean;
  depositError: string;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [address, setAddress] = useState('');
  const [localError, setLocalError] = useState('');

  // A boarding deposit is not pushed on the activity stream, so poll while the
  // address is shown and the wallet is still empty (this view unmounts once it
  // is funded, which stops the poll).
  usePollWhileWaiting(Boolean(address));

  const fetchAddress = useCallback(async () => {
    setLocalError('');
    try {
      setAddress(await onDeposit());
    } catch (err) {
      setLocalError(errorMessage(err));
    }
  }, [onDeposit]);

  // Each step's number chip walks the brand accents in flow order: incoming
  // on-chain funds are sky, the spendable wallet balance is teal, and
  // spending over Lightning is the primary violet.
  const steps: Array<{ text: string; bg: string; fg: string }> = [
    {
      text: 'Send on-chain Bitcoin to your boarding address.',
      bg: palette.skySoft,
      fg: palette.sky,
    },
    {
      text: 'After 1 confirmation it joins the next round.',
      bg: palette.tealSoft,
      fg: palette.teal,
    },
    {
      text: 'Spend instantly over Lightning.',
      bg: palette.violetSoft,
      fg: palette.violet,
    },
  ];
  const error = localError || depositError;

  return (
    <>
      <Band tinted>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <ArrowDownToLine size={26} color={palette.sky} />
          </View>
          <Text style={styles.emptyTitle}>Fund your wallet</Text>
          <Text style={styles.emptyCopy}>
            Your balance is empty. Send Bitcoin to your boarding address to
            start. Funds become spendable once they confirm and join the next
            round.
          </Text>
          {address ? (
            <View style={styles.emptyQr}>
              <QRCode value={address} size={160} />
              <View style={{ alignSelf: 'stretch' }}>
                <CopyRow label="Boarding address" value={address} />
              </View>
            </View>
          ) : (
            <View style={styles.emptyAction}>
              <PrimaryButton
                icon={ArrowDownToLine}
                onPress={() => void fetchAddress()}
                busy={depositBusy}
              >
                {depositBusy ? 'Generating…' : 'Get a boarding address'}
              </PrimaryButton>
              <View style={{ marginTop: 12 }}>
                <InlineError message={error} />
              </View>
            </View>
          )}
          <Pressable onPress={() => onNavigate('receive')} hitSlop={8}>
            <Text style={styles.lightningLink}>
              or create a Lightning invoice
            </Text>
          </Pressable>
        </View>
      </Band>

      <Band>
        <Label accent="sky" rule>
          How boarding works
        </Label>
        <View style={styles.steps}>
          {steps.map((step, i) => (
            <View key={step.text} style={styles.step}>
              <View style={[styles.stepBadge, { backgroundColor: step.bg }]}>
                <Text style={[styles.stepBadgeText, { color: step.fg }]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      </Band>

      <RuntimeBand info={info} phaseLabel={phaseLabel} />
    </>
  );
}

// RecentActivityBand lists the latest entries with a link to full history.
function RecentActivityBand({
  activity,
  onNavigate,
}: {
  activity: readonly Entry[];
  onNavigate: (t: AppTab) => void;
}) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Band tinted>
      <View style={styles.bandHead}>
        <Label accent="teal">Recent activity</Label>
        <Pressable
          onPress={() => onNavigate('activity')}
          style={styles.viewAll}
          hitSlop={8}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <ChevronRight size={13} color={palette.accent} />
        </Pressable>
      </View>
      {activity.length === 0 ? (
        <Text style={styles.emptyList}>No activity yet.</Text>
      ) : (
        <View style={styles.list}>
          {activity.slice(0, 4).map((entry, i) => (
            <View key={entry.id} style={i > 0 && styles.listDivider}>
              <ActivityRow entry={entry} />
            </View>
          ))}
        </View>
      )}
    </Band>
  );
}
