/**
 * Curated, hand-maintained metadata for the API reference that cannot be
 * inferred from the proto: the CLI command page (if any) matching each RPC,
 * and realistic sample request values used by the code sample generators.
 * Playwright imports this file directly, so keep it free of Astro imports
 * and the `~/` alias.
 */

/** CLI page slug (under /cli/) per RPC method name; null when nothing maps. */
export const API_CLI: Record<string, string | null> = {
  Create: 'create',
  Unlock: 'unlock',
  PrepareSend: 'send',
  Send: 'send',
  Recv: 'recv',
  List: 'activity',
  Deposit: 'recv',
  Balance: 'balance',
  Status: null,
  GetExitPlan: 'exit',
  Exit: 'exit',
  ExitStatus: 'exit',
  ExitSummary: 'exit',
  SweepWallet: 'wallet-sweep',
  SubscribeWallet: null,
  InspectActivity: 'activity',
};

/**
 * Curated `darepocli` invocation per RPC method name, used by the Examples
 * CLI tab on each API reference page. Unlike API_CLI (a /cli/ page slug used
 * for the chip link), this is the full command line, subcommand included,
 * with realistic sample values matching API_SAMPLES. Null exactly where
 * API_CLI is null (no CLI command maps to the RPC).
 */
export const API_CLI_INVOCATION: Record<string, string | null> = {
  Create: 'darepocli create',
  Unlock: 'darepocli unlock',
  PrepareSend: 'darepocli send lnbcrt250u1p3xyz...truncated --note "coffee run" --force',
  Send: 'darepocli send lnbcrt250u1p3xyz...truncated --note "coffee run" --force',
  Recv: 'darepocli recv --offchain --amt 25000 --memo "invoice for coffee run"',
  List: 'darepocli activity',
  Deposit: 'darepocli recv --onchain',
  Balance: 'darepocli balance',
  Status: null,
  GetExitPlan:
    'darepocli exit plan --outpoint 4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0',
  Exit: 'darepocli exit --outpoint 4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0',
  ExitStatus:
    'darepocli exit status --outpoint 4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0',
  ExitSummary: 'darepocli exit summary',
  SweepWallet: 'darepocli wallet-sweep --destination bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  SubscribeWallet: null,
  InspectActivity:
    'darepocli activity inspect a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
};

/**
 * Sample request bodies per RPC, keyed by method name. Field names are the
 * proto snake_case names; values should read like a real regtest session.
 */
export const API_SAMPLES: Record<string, Record<string, unknown>> = {
  Create: {
    wallet_password: 'c3RyYXdiZXJyeS1tb29zZQ==',
    recover_state: false,
  },
  Unlock: {
    wallet_password: 'c3RyYXdiZXJyeS1tb29zZQ==',
  },
  PrepareSend: {
    invoice: 'lnbcrt250u1p3xyz...truncated',
    note: 'coffee run',
  },
  Send: {
    send_intent_id: 'si_3f9c2a7b8e1d4560',
  },
  Recv: {
    amt_sat: 25000,
    memo: 'invoice for coffee run',
  },
  List: {
    view: 'LIST_VIEW_ACTIVITY',
    pending_only: false,
    limit: 20,
  },
  Deposit: {
    amt_sat_hint: 100000,
  },
  Balance: {},
  Status: {},
  GetExitPlan: {
    outpoints: ['4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0'],
    conf_target: 6,
  },
  Exit: {
    outpoint: '4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0',
    onchain_address: 'bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  },
  ExitStatus: {
    outpoint: '4b2e9f1a7c3d5e6f8091a2b3c4d5e6f70819a2b3c4d5e6f708192a3b4c5d6e7f:0',
    detailed: true,
  },
  ExitSummary: {},
  SweepWallet: {
    destination_address: 'bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    broadcast: false,
  },
  SubscribeWallet: {
    include_existing: true,
  },
  InspectActivity: {
    id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9',
  },
};
