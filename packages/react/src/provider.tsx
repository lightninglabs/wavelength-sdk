import type { WalletEngine } from "@lightninglabs/wavelength-core";
import { ReactNode, createContext, useContext } from "react";

const WalletEngineContext = createContext<WalletEngine | null>(null);

/**
 * Provides a WalletEngine to descendants. The provider owns nothing: the
 * consumer creates the engine (typically once, at module scope, via
 * createWebWalletEngine or createNativeWalletEngine) and owns its lifetime.
 */
export function WalletDKProvider({
  children,
  engine,
}: {
  /** The subtree that gains access to the wallet engine. */
  children: ReactNode;
  /**
   * A WalletEngine from any transport, e.g. createWebWalletEngine() from
   * \@lightninglabs/wavelength-web.
   */
  engine: WalletEngine;
}) {
  if (!engine) {
    throw new Error(
      "WalletDKProvider requires an `engine` prop. Create one with " +
        "createWebWalletEngine() from @lightninglabs/wavelength-web (or " +
        "createNativeWalletEngine() from @lightninglabs/wavelength-react-native).",
    );
  }

  return (
    <WalletEngineContext.Provider value={engine}>
      {children}
    </WalletEngineContext.Provider>
  );
}

/**
 * Returns the engine from the nearest WalletDKProvider: the escape hatch for
 * anything the granular hooks do not cover. Throws outside a provider.
 */
export function useWalletEngine(): WalletEngine {
  const engine = useContext(WalletEngineContext);
  if (!engine) {
    throw new Error("useWalletEngine must be used inside WalletDKProvider");
  }

  return engine;
}
