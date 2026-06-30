import { useCallback, useEffect, useState } from "react";
import type {
  OpenWalletFromPasskeyResult,
  PasskeyCeremony,
} from "@lightninglabs/walletdk-core";
import { useWalletDK } from "./provider";

/**
 * Pairs the Go-side open result with the credential id that was used, so the app
 * can persist it and scope future unlocks.
 */
export type PasskeyWalletOutcome = {
  /** The result returned by opening the wallet from the passkey. */
  result: OpenWalletFromPasskeyResult;
  /** The credential id used in the ceremony, for persistence and scoping. */
  credentialId: string;
};

/** The state and actions returned by {@link usePasskeyWallet}. */
export type UsePasskeyWallet = {
  /** Whether the environment supports passkey PRF. */
  supported: boolean;
  /** True while a ceremony is in flight. */
  busy: boolean;
  /** The last error message, or "" when there is none. */
  error: string;
  /** Registers a passkey and creates the wallet from it. */
  createPasskeyWallet: (appName: string) => Promise<PasskeyWalletOutcome | null>;
  /**
   * Asserts a passkey (scoped when allowCredentialId is set, discoverable
   * otherwise) and imports/unlocks the wallet.
   */
  openPasskeyWallet: (
    allowCredentialId?: string,
  ) => Promise<PasskeyWalletOutcome | null>;
  /** Clears the current error message. */
  clearError: () => void;
};

/**
 * Drives a passkey ceremony and opens the wallet through the provider's client,
 * refreshing provider state on success so the phase advances automatically. The
 * ceremony is injected (browser: webPasskeyCeremony from walletdk-web; native
 * transports supply their own), which keeps walletdk-react free of any transport
 * dependency. Must be used inside a {@link WalletDKProvider}.
 */
export function usePasskeyWallet(ceremony: PasskeyCeremony): UsePasskeyWallet {
  const { client, refresh } = useWalletDK();
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    ceremony.supportsPasskeyPrf().then(
      (v) => {
        if (!cancelled) setSupported(v);
      },
      () => {
        // An injected ceremony whose probe rejects degrades to unsupported
        // rather than leaving an unhandled rejection.
        if (!cancelled) setSupported(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ceremony]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setError("");
      setBusy(true);
      try {
        return await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createPasskeyWallet = useCallback(
    (appName: string) =>
      run(async () => {
        const { prfOutput, credentialId } =
          await ceremony.registerPasskeyWallet(appName);
        const result = await client.openWalletFromPasskey({ prfOutput });
        await refresh().catch(() => undefined);
        return { result, credentialId };
      }),
    [run, client, refresh, ceremony],
  );

  const openPasskeyWallet = useCallback(
    (allowCredentialId?: string) =>
      run(async () => {
        const { prfOutput, credentialId } =
          await ceremony.assertPasskeyPrf(allowCredentialId);
        const result = await client.openWalletFromPasskey({ prfOutput });
        await refresh().catch(() => undefined);
        return { result, credentialId };
      }),
    [run, client, refresh, ceremony],
  );

  const clearError = useCallback(() => setError(""), []);

  return {
    supported,
    busy,
    error,
    createPasskeyWallet,
    openPasskeyWallet,
    clearError,
  };
}
