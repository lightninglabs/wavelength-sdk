import type { Info, Status } from './generated.ts';

/**
 * The wallet lifecycle, exposed as a lowercase string union to match the SDK's
 * other enums (EntryKind, SendRail, ...). The daemon sends the proto's numeric
 * enum; the client maps it to these strings at the response boundary via
 * {@link walletStateFromProto}.
 */
export const WalletState = {
  /** No wallet exists yet; one must be created. */
  None: 'none',
  /** A wallet exists but is locked and must be unlocked. */
  Locked: 'locked',
  /** The wallet is unlocked and ready to use. */
  Ready: 'ready',
  /** The wallet is unlocked and catching up with the chain. */
  Syncing: 'syncing',
} as const;

/**
 * The wallet lifecycle value type: one of the {@link WalletState} string values.
 */
export type WalletState = (typeof WalletState)[keyof typeof WalletState];

/**
 * Maps the daemon's numeric WalletState enum to the SDK string. The daemon never
 * emits 0 (Unspecified); a missing/unknown value maps to 'none', the safe
 * non-ready state.
 */
const PROTO_WALLET_STATE: Record<number, WalletState> = {
  1: WalletState.None,
  2: WalletState.Locked,
  3: WalletState.Ready,
  4: WalletState.Syncing,
};

/**
 * Normalizes a raw daemon walletState (a proto number) to the SDK string union.
 * Already-string values pass through unchanged.
 *
 * @param value - The raw walletState as a proto number, an SDK string, or undefined.
 * @returns The normalized {@link WalletState} string.
 */
export function walletStateFromProto(
  value: number | WalletState | undefined,
): WalletState {
  if (typeof value === 'string') {
    return value;
  }

  // An absent value or the proto's 0 (Unspecified) means no wallet yet.
  if (value === undefined || value === 0) {
    return WalletState.None;
  }

  // A recognized enum maps directly. An unrecognized non-zero value (a future
  // or garbled daemon state) maps to the conservative 'locked', not 'none', so
  // it never drives the UI into creating a wallet over an existing one.
  return PROTO_WALLET_STATE[value] ?? WalletState.Locked;
}

// Response types are generated from the daemon facade (see generated.ts and
// docs/codegen.md). Most are re-exported verbatim; a few keep the SDK's existing
// public name.

/**
 * The daemon's Info with walletState normalized to the string union and the
 * walletReady predicate backfilled (the facade exposes it as a Go method, so it
 * is absent from the JSON). The client always returns this complete shape from
 * `getInfo()`/`start()`; the React provider holds a `Partial<WalletInfo>` while
 * it builds state incrementally across create/unlock.
 */
export type WalletInfo = Omit<Info, 'walletState'> & {
  /** The wallet lifecycle as the SDK string union. */
  walletState: WalletState;
  /** True iff the wallet is unlocked and ready (mirrors the Go Info.WalletReady() method). */
  walletReady: boolean;
};

/**
 * Maps a raw daemon Info (numeric walletState, no walletReady) onto the public
 * {@link WalletInfo}: it converts walletState to the string union and backfills
 * walletReady (ready iff walletState === 'ready'), mirroring the Go
 * Info.WalletReady() method. Transports apply this at the getInfo boundary.
 *
 * @param raw - The raw daemon Info payload (untrusted shape).
 * @returns The normalized {@link WalletInfo}.
 */
export function normalizeInfo(raw: unknown): WalletInfo {
  const info = (raw ?? {}) as Partial<Info> & { walletReady?: boolean };
  const walletState = walletStateFromProto(
    info.walletState as number | WalletState | undefined,
  );

  return {
    ...(info as object),
    walletState,
    walletReady: info.walletReady ?? walletState === WalletState.Ready,
  } as WalletInfo;
}

/**
 * The lifecycle a UI renders. The runtime phases
 * (loading/runtimeReady/starting/stopping/stopped/error) are owned by the host's
 * start/stop flow; the wallet phases (needsWallet/locked/syncing/ready) are
 * derived from {@link WalletInfo} by {@link phaseFromInfo}. It lives in core so
 * non-React (and future React-Native) consumers share one vocabulary.
 */
export type RuntimePhase =
  | 'loading'
  | 'runtimeReady'
  | 'starting'
  | 'needsWallet'
  | 'locked'
  | 'syncing'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'error';

/**
 * Derives the wallet-state phase from a {@link WalletInfo}. Runtime phases are
 * not represented here; the caller owns those.
 *
 * @param info - The wallet state and readiness to derive the phase from.
 * @returns The wallet-state {@link RuntimePhase}.
 */
export function phaseFromInfo(info: {
  walletState?: WalletState;
  walletReady?: boolean;
}): RuntimePhase {
  if (info.walletReady || info.walletState === WalletState.Ready) {
    return 'ready';
  }

  switch (info.walletState) {
  case WalletState.Locked:
    return 'locked';

  case WalletState.Syncing:
    return 'syncing';

  case WalletState.None:
  default:
    return 'needsWallet';
  }
}

/**
 * The daemon's runtime status snapshot, re-exported verbatim under the SDK's
 * public name.
 */
export type WalletStatus = Status;
