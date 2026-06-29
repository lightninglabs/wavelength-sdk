// Request types stay hand-authored: they carry semantics the wire shape does not
// (e.g. a plain password the client base64-encodes into the Go []byte field), so
// packages/web keeps explicit request mappers for them.

import type { ListView } from './generated';

/**
 * Parameters for creating a new wallet.
 */
export type CreateWalletRequest = {
  /** The plain password the client base64-encodes into the daemon's byte field. */
  password: string;
  /** An optional existing mnemonic to restore from; a fresh one is generated when omitted. */
  mnemonic?: string[];
  /** An optional BIP-39 passphrase applied on top of the mnemonic. */
  seedPassphrase?: string;
};

/**
 * Parameters for unlocking an existing wallet.
 */
export type UnlockWalletRequest = {
  /** The plain password the client base64-encodes into the daemon's byte field. */
  password: string;
};

/**
 * Parameters for opening a wallet from a passkey assertion.
 */
export type OpenWalletFromPasskeyRequest = {
  /** The PRF output (hex) derived from the passkey ceremony. */
  prfOutput: string;
};

/**
 * Parameters for generating an on-chain deposit address.
 */
export type DepositRequest = {
  /** An optional hint for the amount (in sats) the caller intends to deposit. */
  amountSatHint?: number;
};

/**
 * Parameters for generating a receive invoice.
 */
export type ReceiveRequest = {
  /** The amount to request, in sats. */
  amountSat: number;
  /** An optional memo attached to the invoice. */
  memo?: string;
};

/**
 * Parameters for sending a payment, as a discriminated union: supply an
 * `invoice` for a Lightning send or an `onchainAddress` for an on-chain send.
 * The two are mutually exclusive, and `sweepAll` applies only to on-chain sends.
 */
export type SendRequest =
  | {
      /** A Lightning invoice to pay. */
      invoice: string;
      /** The amount to send, in sats. Omit to pay the invoice's own amount. */
      amountSat?: number;
      /** An optional note recorded with the activity. */
      note?: string;
      /** An optional cap on the fee, in sats. */
      maxFeeSat?: number;
    }
  | {
      /** An on-chain address to pay. */
      onchainAddress: string;
      /** The amount to send, in sats. Provide this or set `sweepAll`. */
      amountSat?: number;
      /** When true, sweeps the entire spendable balance to the destination. */
      sweepAll?: boolean;
      /** An optional note recorded with the activity. */
      note?: string;
      /** An optional cap on the fee, in sats. */
      maxFeeSat?: number;
    };

/**
 * Parameters for listing wallet activity or UTXOs.
 */
export type ListRequest = {
  /** Which view to list: activity entries, VTXOs, or on-chain outputs. */
  view?: ListView;
  /** When true, returns only pending items. */
  pendingOnly?: boolean;
  /** The maximum number of items to return. */
  limit?: number;
  /** The number of items to skip for pagination. */
  offset?: number;
};

/**
 * Parameters for exiting a single outpoint, attempting a cooperative leave to
 * the optional destination.
 */
export type ExitRequest = {
  /** The VTXO outpoint to exit. */
  outpoint: string;
  /** An optional on-chain destination for the exited funds. */
  destination?: string;
};

/**
 * Parameters for querying the status of an exit.
 */
export type ExitStatusRequest = {
  /** The VTXO outpoint whose exit status is queried. */
  outpoint: string;
};

/**
 * Previews unilateral-exit readiness for a set of VTXO outpoints (funding the
 * backing wallet needs before Exit can run).
 */
export type GetExitPlanRequest = {
  /** The VTXO outpoints to plan an exit for. */
  outpoints: string[];
  /** An optional confirmation target (in blocks) used to estimate fees. */
  confTarget?: number;
};

/**
 * Previews (`broadcast: false`) or broadcasts (`broadcast: true`) a sweep of the
 * backing wallet to destinationAddress. It moves funds when broadcast is true,
 * so surface the preview to the user first.
 */
export type SweepWalletRequest = {
  /** The on-chain address to sweep the backing wallet to. */
  destinationAddress: string;
  /** When true, broadcasts the sweep; when false (the default), only previews it. */
  broadcast?: boolean;
  /** An optional explicit fee rate, in sat/vByte. */
  feeRateSatPerVByte?: number;
  /** An optional confirmation target (in blocks) used to estimate fees. */
  confTarget?: number;
};
