import { Balance } from "@lightninglabs/wavelength-react";

// Money is read only from the Balance snapshot, never summed out of activity
// entries. The daemon reports Balance atomically (confirmed_sat rises and
// pending_in_sat clears in the same read), while activity rows lag it, and
// confirmed_sat blends boarded deposits, receives and send change, so no entry
// can be attributed back to it. Deriving either from the other is what produced
// double-counted totals. Activity describes history and status; Balance is the
// sole source of truth for value.

// BucketKey identifies a balance-composition bucket. There is exactly one bucket
// per wavewalletrpc Balance field, so the composition is a complete decomposition
// of a single atomic snapshot: no field is ignored, none is counted twice.
export type BucketKey =
  | "vtxo"
  | "creditAvailable"
  | "incoming"
  | "outgoing"
  | "creditReserved";

// CompositionBucket is one slice of the balance-composition visual.
export type CompositionBucket = {
  key: BucketKey;
  label: string;
  sat: number;
};

// BUCKET_TONE maps each bucket to a CSS colour variable so the meter renders
// correctly under both light and dark palettes (the values are set in
// index.css). These are raw CSS colours because the widths are inline-styled.
// Spendable buckets share the accent family; in-flight ones are tinted apart.
export const BUCKET_TONE: Record<BucketKey, string> = {
  vtxo: "var(--accent)",
  creditAvailable: "var(--accent-soft)",
  incoming: "var(--good)",
  outgoing: "var(--warn)",
  creditReserved: "var(--muted)",
};

// ALWAYS_SHOWN_BUCKETS render even at zero so the usual view stays a stable
// three columns. The credit buckets appear only once the wallet holds credit.
export const ALWAYS_SHOWN_BUCKETS: BucketKey[] = [
  "vtxo",
  "incoming",
  "outgoing",
];

// sat coerces an optional Balance field to a number.
function sat(value: number | undefined | null): number {
  return Number(value ?? 0);
}

// balanceSat returns the spendable VTXO balance (wavewalletrpc confirmed_sat).
export function balanceSat(balance: Balance | null): number {
  return sat(balance?.confirmedSat);
}

// pendingInSat returns the in-flight inbound amount (wavewalletrpc
// pending_in_sat). Despite the proto comment, the daemon sums the confirmed,
// unconfirmed and adopted boarding totals into it: an in-flight Lightning
// receive is not counted, so an unpaid invoice leaves this at zero.
export function pendingInSat(balance: Balance | null): number {
  return sat(balance?.pendingInSat);
}

// pendingOutSat returns the in-flight outbound amount (wavewalletrpc
// pending_out_sat). Again despite the proto comment, the daemon reports only the
// pending boarding sweep here: an in-flight send or exit is not counted.
export function pendingOutSat(balance: Balance | null): number {
  return sat(balance?.pendingOutSat);
}

// creditAvailableSat returns the server-authoritative available credit balance
// (wavewalletrpc credit_available_sat).
export function creditAvailableSat(balance: Balance | null): number {
  return sat(balance?.creditAvailableSat);
}

// creditReservedSat returns the server-authoritative in-flight credit
// reservation (wavewalletrpc credit_reserved_sat).
export function creditReservedSat(balance: Balance | null): number {
  return sat(balance?.creditReservedSat);
}

// compositionBuckets decomposes one Balance snapshot into its five fields.
export function compositionBuckets(
  balance: Balance | null,
): CompositionBucket[] {
  return [
    { key: "vtxo", label: "Ark VTXO", sat: balanceSat(balance) },
    {
      key: "creditAvailable",
      label: "Credit available",
      sat: creditAvailableSat(balance),
    },
    { key: "incoming", label: "Incoming", sat: pendingInSat(balance) },
    { key: "outgoing", label: "Outgoing", sat: pendingOutSat(balance) },
    {
      key: "creditReserved",
      label: "Credit reserved",
      sat: creditReservedSat(balance),
    },
  ];
}

// hasAnyValue reports whether the wallet holds or is moving any funds. It reads
// the same decomposition the composition renders, so the dashboard gate and the
// meter can never disagree.
export function hasAnyValue(balance: Balance | null): boolean {
  return compositionBuckets(balance).some((bucket) => bucket.sat > 0);
}
