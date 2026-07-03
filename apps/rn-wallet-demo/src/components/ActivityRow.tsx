import { Text, View } from 'react-native';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  LogOut,
  type LucideIcon,
} from 'lucide-react-native';
import { Entry } from '@lightninglabs/walletdk-react';
import { formatSats, formatTimestamp, shortKey } from '../lib/format';
import { Palette, fonts } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

const KIND_ICON: Record<string, LucideIcon> = {
  receive: ArrowDownLeft,
  send: ArrowUpRight,
  deposit: Layers,
  exit: LogOut,
};

const KIND_LABEL: Record<string, string> = {
  receive: 'Received',
  send: 'Sent',
  deposit: 'Boarding deposit',
  exit: 'Unilateral exit',
};

const makeStyles = (p: Palette) => ({
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    paddingVertical: 12,
  },
  iconBox: {
    alignItems: 'center' as const,
    borderColor: p.border,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
  },
  main: {
    flex: 1,
  },
  title: {
    color: p.text,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  meta: {
    color: p.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
  failReason: {
    color: p.bad,
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  status: {
    alignSelf: 'flex-start' as const,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  statusText: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  amountCol: {
    alignItems: 'flex-end' as const,
  },
  amount: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
  },
  fee: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
});

// ActivityRow renders a single dense transaction line from an SDK Entry. The
// counterparty is a bare string (pubkey / address / invoice), so the local
// note is the title and a truncated counterparty is shown monospace beneath.
export function ActivityRow({ entry }: { entry: Entry }) {
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const Icon = KIND_ICON[entry.kind] ?? Activity;
  const incoming = entry.kind === 'receive' || entry.kind === 'deposit';
  const failed = entry.status === 'failed';
  const pending = entry.status === 'pending';
  const sign = incoming ? '+' : '-';
  const title = entry.note || KIND_LABEL[entry.kind] || entry.kind;
  const time = formatTimestamp(entry.createdAt);
  const meta = entry.counterparty
    ? `${shortKey(entry.counterparty, 10, 6)}${time ? ` · ${time}` : ''}`
    : time;
  const amountColor = failed ? palette.faint : incoming ? palette.good : palette.text;
  const statusColor = failed ? palette.bad : palette.warn;
  const statusBg = failed ? palette.badSoft : palette.warnSoft;

  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Icon size={15} color={incoming ? palette.good : palette.text} />
      </View>
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {failed && entry.failureReason ? (
          <Text style={styles.failReason} numberOfLines={1}>
            {entry.failureReason}
          </Text>
        ) : null}
        {pending || failed ? (
          <View
            style={[styles.status, { backgroundColor: statusBg, borderColor: statusColor }]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>
              {entry.status}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.amountCol}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {sign}
          {formatSats(Math.abs(entry.amountSat ?? 0))}
        </Text>
        {entry.feeSat && entry.feeSat > 0 ? (
          <Text style={styles.fee}>fee {formatSats(entry.feeSat)}</Text>
        ) : null}
      </View>
    </View>
  );
}
