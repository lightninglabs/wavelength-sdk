import { createWalletEngine, type WalletEngine } from "@lightninglabs/wavelength-core";
import { FakeWavelengthClient } from "./fake-client";

/**
 * A WalletEngine over a FakeWavelengthClient, the standard setup for hook tests.
 */
export function createTestEngine(client = new FakeWavelengthClient()): {
  client: FakeWavelengthClient;
  engine: WalletEngine;
} {
  return { client, engine: createWalletEngine({ client }) };
}
