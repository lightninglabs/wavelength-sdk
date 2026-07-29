import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultDataDir } from '@lightninglabs/wavelength-react-native';
import type { WalletKind } from '@lightninglabs/wavelength-react';
import type { RuntimeConfig } from '@lightninglabs/wavelength-react-native';
import type { RuntimeNetwork, WalletEndpoints } from './runtime-config';

// The registry is the demo's source of truth for which wallets exist: the
// daemon cannot enumerate wallets without being started against a data dir,
// so the list, names, and per-wallet network live here in AsyncStorage.
export type WalletEntry = {
  id: string;
  name: string;
  network: RuntimeNetwork | null;
  walletKind: WalletKind | null;
  credentialId: string | null;
  dataDir: string;
  endpoints: WalletEndpoints | null;
  createdAt: number;
  lastUsedAt: number;
};

const WALLETS_KEY = 'wavelength.wallets';
// LEGACY_KIND_KEY and LEGACY_CREDENTIAL_KEY are the fixed markers the
// single-wallet demo wrote. RN always used the default data dir, so unlike
// web's per-dataDir key family, there is only ever one legacy wallet to
// migrate.
const LEGACY_KIND_KEY = 'wavelength.walletKind';
const LEGACY_CREDENTIAL_KEY = 'wavelength.passkeyCredentialId';

// newId returns a locally-unique id: Hermes has no crypto.randomUUID and this
// id only namespaces AsyncStorage entries and filesystem paths, not a
// security boundary, so a timestamp plus a random suffix is enough.
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// isEntry keeps a corrupt or hand-edited registry from crashing the app: any
// row missing the load-bearing string fields is dropped on read.
function isEntry(value: unknown): value is WalletEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;

  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.dataDir === 'string'
  );
}

// loadWallets returns every registered wallet, most recently used first.
// The one-time legacy migration runs first so pre-registry installs surface
// their existing wallet.
export async function loadWallets(): Promise<WalletEntry[]> {
  await migrateLegacyEntries();
  let parsed: unknown;
  try {
    const raw = await AsyncStorage.getItem(WALLETS_KEY);
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

async function saveWallets(entries: WalletEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(WALLETS_KEY, JSON.stringify(entries));
  } catch {
    // Non-fatal (storage full or unavailable): the wallet still works this
    // session; it just will not be listed after a restart.
  }
}

// addWallet appends a new entry to the registry.
export async function addWallet(entry: WalletEntry): Promise<void> {
  await saveWallets([...(await loadWallets()), entry]);
}

// updateWallet shallow-merges a patch into the entry with the given id.
export async function updateWallet(
  id: string,
  patch: Partial<WalletEntry>,
): Promise<void> {
  await saveWallets(
    (await loadWallets()).map((e) => (e.id === id ? { ...e, ...patch } : e)),
  );
}

// removeWallet drops the entry with the given id. This removes the wallet
// from the list only; its on-disk files stay until "Clear all data".
export async function removeWallet(id: string): Promise<void> {
  await saveWallets((await loadWallets()).filter((e) => e.id !== id));
}

// newWalletEntry builds a fresh entry: a random id doubles as the per-wallet
// data dir segment, so every wallet's databases are distinct. dataDirRoot is
// resolved once by the caller via getDefaultDataDir() so this stays pure and
// synchronous; the result is absolute because that root is absolute (a bare
// relative dataDir hangs Android startup).
export function newWalletEntry(args: {
  name: string;
  network: RuntimeNetwork;
  endpoints: WalletEndpoints;
  dataDirRoot: string;
}): WalletEntry {
  const id = newId();
  const now = Date.now();

  return {
    id,
    name: args.name,
    network: args.network,
    walletKind: null,
    credentialId: null,
    dataDir: `${args.dataDirRoot}/${id}`,
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
    throw new Error('wallet entry has no network; choose one first');
  }

  return {
    network,
    dataDir: entry.dataDir,
    allowMainnet: false,
    disableSwaps: false,
    ...endpoints,
  };
}

// migrateLegacyEntries seeds the registry once from the single-wallet era's
// fixed marker keys. RN has no per-dataDir key family (it always used the
// default data dir), so at most one legacy entry is ever seeded, pointing at
// that default root where the legacy wallet's databases actually live. Old
// keys are removed only after the seed write succeeds.
async function migrateLegacyEntries(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(WALLETS_KEY)) !== null) {
      return;
    }
    const [kind, credentialId] = await Promise.all([
      AsyncStorage.getItem(LEGACY_KIND_KEY),
      AsyncStorage.getItem(LEGACY_CREDENTIAL_KEY),
    ]);
    if (kind === null && credentialId === null) {
      return;
    }
    const dataDir = await getDefaultDataDir();
    const now = Date.now();
    const entry: WalletEntry = {
      id: newId(),
      name: 'My Wallet',
      network: null,
      walletKind: kind === 'passkey' || kind === 'password' ? kind : null,
      credentialId,
      dataDir,
      endpoints: null,
      createdAt: now,
      lastUsedAt: now,
    };
    await AsyncStorage.setItem(WALLETS_KEY, JSON.stringify([entry]));
    await AsyncStorage.multiRemove([LEGACY_KIND_KEY, LEGACY_CREDENTIAL_KEY]);
  } catch {
    // Non-fatal: an unreadable AsyncStorage just yields an empty registry.
  }
}
