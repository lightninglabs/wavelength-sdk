import type { WalletKind } from "@lightninglabs/wavelength-react";
import type { RuntimeConfig } from "@lightninglabs/wavelength-web";
import type { RuntimeNetwork, WalletEndpoints } from "./runtime-config";

// The registry is the demo's source of truth for which wallets exist: the
// daemon cannot enumerate wallets without being started against a data dir,
// so the list, names, and per-wallet network live here in localStorage.
export type WalletEntry = {
  id: string;
  name: string;
  network: RuntimeNetwork | null;
  walletKind: WalletKind | null;
  credentialId: string | null;
  dataDir: string;
  endpoints: WalletEndpoints | null;
  swapDatabaseFileName?: string;
  createdAt: number;
  lastUsedAt: number;
};

const WALLETS_KEY = "wavelength:wallets";
const LEGACY_KIND_PREFIX = "wavelength:wallet-kind:";
const LEGACY_CRED_PREFIX = "wavelength:passkey-cred:";
// LEGACY_SWAP_DB is the swap database path the single-wallet demo pinned for
// every wallet; migrated entries must keep using it. New wallets leave the
// field unset so the daemon defaults the swap DB under the wallet's own
// network dir.
const LEGACY_SWAP_DB = "/wavelength-swaps.db";

// isEntry keeps a corrupt or hand-edited registry from crashing the app: any
// row missing the load-bearing string fields is dropped on read.
function isEntry(value: unknown): value is WalletEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;

  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.dataDir === "string"
  );
}

// loadWallets returns every registered wallet, most recently used first.
// The one-time legacy migration runs first so pre-registry installs surface
// their existing wallet.
export function loadWallets(): WalletEntry[] {
  migrateLegacyEntries();
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(WALLETS_KEY);
    if (!raw) {
      return [];
    }
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(isEntry)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
}

function saveWallets(entries: WalletEntry[]): void {
  try {
    localStorage.setItem(WALLETS_KEY, JSON.stringify(entries));
  } catch {
    // Non-fatal (quota / private mode): the wallet still works this session;
    // it just will not be listed after a reload.
  }
}

// addWallet appends a new entry to the registry.
export function addWallet(entry: WalletEntry): void {
  saveWallets([...loadWallets(), entry]);
}

// updateWallet shallow-merges a patch into the entry with the given id.
export function updateWallet(id: string, patch: Partial<WalletEntry>): void {
  saveWallets(
    loadWallets().map((e) => (e.id === id ? { ...e, ...patch } : e)),
  );
}

// removeWallet drops the entry with the given id. On web this removes the
// wallet from the list only; its OPFS files stay until "Clear all data"
// (OPFS names are flat FNV hashes of daemon-internal paths, so targeted
// per-wallet deletion is deliberately not attempted).
export function removeWallet(id: string): void {
  saveWallets(loadWallets().filter((e) => e.id !== id));
}

// newWalletEntry builds a fresh entry: a random id doubles as the per-wallet
// OPFS data dir segment, so every wallet's databases are distinct.
export function newWalletEntry(args: {
  name: string;
  network: RuntimeNetwork;
  endpoints: WalletEndpoints;
}): WalletEntry {
  const id = crypto.randomUUID();
  const now = Date.now();

  return {
    id,
    name: args.name,
    network: args.network,
    walletKind: null,
    credentialId: null,
    dataDir: `/wallets/${id}`,
    endpoints: args.endpoints,
    createdAt: now,
    lastUsedAt: now,
  };
}

// runtimeConfigForEntry assembles the start() config purely from the entry.
// The override carries a not-yet-persisted network choice for legacy entries
// (persisted only after a successful unlock proves the guess right).
export function runtimeConfigForEntry(
  entry: WalletEntry,
  override?: { network: RuntimeNetwork; endpoints: WalletEndpoints },
): RuntimeConfig {
  const network = override?.network ?? entry.network;
  const endpoints = override?.endpoints ?? entry.endpoints;
  if (!network || !endpoints) {
    throw new Error("wallet entry has no network; choose one first");
  }

  return {
    network,
    dataDir: entry.dataDir,
    allowMainnet: false,
    disableSwaps: false,
    ...endpoints,
    ...(entry.swapDatabaseFileName
      ? { swapDatabaseFileName: entry.swapDatabaseFileName }
      : {}),
  };
}

// migrateLegacyEntries seeds the registry once from the single-wallet era's
// per-dataDir marker keys. Each old data dir becomes a legacy entry with an
// unknown network (resolved by a one-time picker on first open). Old keys
// are removed only after the seed write succeeds.
function migrateLegacyEntries(): void {
  try {
    if (localStorage.getItem(WALLETS_KEY) !== null) {
      return;
    }
    const dataDirs = new Set<string>();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LEGACY_KIND_PREFIX)) {
        dataDirs.add(key.slice(LEGACY_KIND_PREFIX.length));
      }
      if (key.startsWith(LEGACY_CRED_PREFIX)) {
        dataDirs.add(key.slice(LEGACY_CRED_PREFIX.length));
      }
    }
    if (dataDirs.size === 0) {
      return;
    }
    const now = Date.now();
    const entries: WalletEntry[] = [...dataDirs].map((dataDir) => {
      const kind = localStorage.getItem(LEGACY_KIND_PREFIX + dataDir);

      return {
        id: crypto.randomUUID(),
        name: dataDir,
        network: null,
        walletKind: kind === "passkey" || kind === "password" ? kind : null,
        credentialId: localStorage.getItem(LEGACY_CRED_PREFIX + dataDir),
        dataDir,
        endpoints: null,
        swapDatabaseFileName: LEGACY_SWAP_DB,
        createdAt: now,
        lastUsedAt: now,
      };
    });
    localStorage.setItem(WALLETS_KEY, JSON.stringify(entries));
    for (const dataDir of dataDirs) {
      localStorage.removeItem(LEGACY_KIND_PREFIX + dataDir);
      localStorage.removeItem(LEGACY_CRED_PREFIX + dataDir);
    }
  } catch {
    // Non-fatal: an unreadable localStorage just yields an empty registry.
  }
}
