import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { WalletVTXO } from '@lightninglabs/wavelength-react';
import { formatSats, shortKey } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { InlineError } from '../ui/InlineError';
import { Spinner } from '../ui/Spinner';

const makeStyles = (p: Palette) => ({
  wrap: {
    marginTop: 16,
  },
  loading: {
    alignItems: 'center' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  loadingText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
  },
  empty: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderStyle: 'dashed' as const,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 32,
  },
  emptyText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center' as const,
  },
  list: {
    borderColor: p.border,
    borderWidth: 1,
  },
  row: {
    alignItems: 'center' as const,
    backgroundColor: p.surface,
    flexDirection: 'row' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowOn: {
    backgroundColor: p.accentSoft,
  },
  rowDivider: {
    borderColor: p.border,
    borderTopWidth: 1,
  },
  marker: {
    alignItems: 'center' as const,
    borderColor: p.borderStrong,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center' as const,
    width: 16,
  },
  markerOn: {
    backgroundColor: p.accent,
    borderColor: p.accent,
  },
  outpoint: {
    color: p.muted,
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  outpointOn: {
    color: p.text,
  },
  amount: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  amountUnit: {
    color: p.faint,
    fontFamily: fonts.sansMedium,
    fontSize: 10,
  },
  footer: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 12,
  },
  footerText: {
    color: p.muted,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  footerTotal: {
    color: p.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
});

// VTXOPicker lists the wallet's VTXOs as a multi-select. The parent owns the
// inventory fetch (a single list({ view: 'vtxos' }) shared with the rest of
// the screen) and the selection, and passes the VTXOs in; this component only
// filters, renders, and reports the chosen outpoints upward. `excludeOutpoints`
// filters out VTXOs that already have an exit in progress, so the same outpoint
// cannot be queued for a second exit.
export function VTXOPicker({
  vtxos: inventory,
  pending,
  error,
  selected,
  onChange,
  excludeOutpoints = [],
}: {
  vtxos: readonly WalletVTXO[];
  pending: boolean;
  error: Error | null;
  selected: string[];
  onChange: (next: string[]) => void;
  excludeOutpoints?: string[];
}) {
  const styles = useThemedStyles(makeStyles);

  const vtxos: WalletVTXO[] = inventory.filter(
    (v) => !excludeOutpoints.includes(v.outpoint),
  );

  // Drop any already-selected outpoint that has since become excluded (e.g.
  // an exit started for it elsewhere) so it cannot remain queued.
  useEffect(() => {
    const next = selected.filter((o) => !excludeOutpoints.includes(o));
    if (next.length !== selected.length) {
      onChange(next);
    }
  }, [excludeOutpoints, selected, onChange]);

  const toggle = (outpoint: string) =>
    onChange(
      selected.includes(outpoint)
        ? selected.filter((o) => o !== outpoint)
        : [...selected, outpoint],
    );

  if (error) {
    return (
      <View style={styles.wrap} testID="vtxo-picker">
        <InlineError message={error.message} />
      </View>
    );
  }

  if (pending && vtxos.length === 0) {
    return (
      <View style={[styles.wrap, styles.loading]} testID="vtxo-picker">
        <Spinner size={15} />
        <Text style={styles.loadingText}>Loading your VTXOs…</Text>
      </View>
    );
  }

  if (vtxos.length === 0) {
    return (
      <View style={[styles.wrap, styles.empty]} testID="vtxo-picker">
        <Text style={styles.emptyText}>No VTXOs to exit.</Text>
      </View>
    );
  }

  const total = vtxos
    .filter((v) => selected.includes(v.outpoint))
    .reduce((sum, v) => sum + v.amountSat, 0);

  return (
    <View style={styles.wrap} testID="vtxo-picker">
      <View style={styles.list}>
        {vtxos.map((v, i) => {
          const on = selected.includes(v.outpoint);

          return (
            <Pressable
              key={v.outpoint}
              testID="vtxo-row"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(v.outpoint)}
              style={[
                styles.row,
                i > 0 && styles.rowDivider,
                on && styles.rowOn,
              ]}
            >
              {/* Selection marker: a filled accent box when chosen, a hairline
                  outline when not, so the whole row reads as a checkbox. */}
              <View style={[styles.marker, on && styles.markerOn]}>
                {on ? <Check size={12} strokeWidth={3} color="#ffffff" /> : null}
              </View>
              <Text
                style={[styles.outpoint, on && styles.outpointOn]}
                numberOfLines={1}
              >
                {shortKey(v.outpoint)}
              </Text>
              <Text style={styles.amount}>
                {formatSats(v.amountSat)}
                <Text style={styles.amountUnit}> sats</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {selected.length} of {vtxos.length} selected
        </Text>
        {selected.length > 0 ? (
          <Text style={styles.footerTotal}>{formatSats(total)} sats</Text>
        ) : null}
      </View>
    </View>
  );
}
