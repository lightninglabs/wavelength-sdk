import { createWalletEngine, type WalletEngine } from "@lightninglabs/wavelength-core";
import { FakeWalletDKClient } from "./fake-client";

/**
 * A WalletEngine over a FakeWalletDKClient, the standard setup for hook tests.
 */
export function createTestEngine(client = new FakeWalletDKClient()): {
  client: FakeWalletDKClient;
  engine: WalletEngine;
} {
  return { client, engine: createWalletEngine({ client }) };
}
