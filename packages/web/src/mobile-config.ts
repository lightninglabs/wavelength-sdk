import {
  CreateWalletRequest,
  RuntimeConfig,
  UnlockWalletRequest,
} from '@lightninglabs/walletdk-core';

/**
 * The flat, snake_case config the walletdk mobile facade's `start` verb decodes
 * (sdk/walletdk/mobile.mobileConfig). The browser bridge forwards it verbatim to
 * mobile.Start.
 */
export type MobileConfig = {
  data_dir?: string;
  network?: string;
  allow_mainnet?: boolean;
  debug_level?: string;
  wallet_type?: string;
  wallet_esplora_url?: string;
  server_address?: string;
  server_transport?: string;
  server_insecure?: boolean;
  swap_server_address?: string;
  swap_server_transport?: string;
  swap_server_insecure?: boolean;
  swap_database_file_name?: string;
};

/**
 * Maps the public RuntimeConfig onto the flat config the mobile facade expects.
 * The embedded daemon runs in the browser and reaches the Ark operator and swap
 * server over grpc-gateway REST (a browser cannot speak native gRPC), so the
 * gateway URLs become REST server addresses. Only the lightweight Esplora-backed
 * wallet runs under wasm.
 *
 * Mailbox addressing: the mobile facade's MobileConfig has a single
 * server_address (and swap_server_address) per service. Mailbox traffic shares
 * that edge, so RuntimeConfig deliberately does not expose separate mailbox
 * gateway fields. If a future facade version splits the mailbox onto its own
 * address, add the field to RuntimeConfig and thread it through here.
 */
export function toMobileConfig(config: RuntimeConfig): MobileConfig {
  const out: MobileConfig = {
    network: config.network,
    allow_mainnet: config.allowMainnet,
    data_dir: config.dataDir,
    debug_level: config.debugLevel,
    wallet_type: 'lwwallet',
    wallet_esplora_url: config.esploraUrl,
    server_address: config.arkServerUrl,
    server_transport: 'rest',
    server_insecure: config.serverInsecure,
  };

  // Leaving the swap server address unset disables the swap subsystem, so omit
  // every swap field when the host asked to run without swaps.
  if (!config.disableSwaps) {
    out.swap_server_address = config.swapServerUrl;
    out.swap_server_transport = 'rest';
    out.swap_server_insecure = config.swapServerInsecure;
    out.swap_database_file_name = config.swapDatabaseFileName;
  }

  return out;
}

/**
 * Encodes a string as base64 of its UTF-8 bytes, matching how Go's
 * encoding/json represents a []byte field. btoa alone is Latin-1 only and throws
 * on code points > 255, so non-ASCII passwords would otherwise break.
 */
export function base64FromUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Maps the TS-convention {@link CreateWalletRequest} (with a string password
 * field) to the Go JSON shape the wasm facade expects. Go's encoding/json uses
 * struct field names verbatim and represents []byte as base64, so WalletPassword
 * and SeedPassphrase must arrive as base64.
 */
export function toGoCreateWalletReq(req: CreateWalletRequest) {
  return {
    WalletPassword: req.password ? base64FromUtf8(req.password) : undefined,
    Mnemonic: req.mnemonic,
    SeedPassphrase: req.seedPassphrase
      ? base64FromUtf8(req.seedPassphrase)
      : undefined,
  };
}

/**
 * Maps the TS-convention {@link UnlockWalletRequest} to the Go JSON shape,
 * base64-encoding the password string for the []byte field.
 */
export function toGoUnlockWalletReq(req: UnlockWalletRequest) {
  return {
    WalletPassword: req.password ? base64FromUtf8(req.password) : undefined,
  };
}
