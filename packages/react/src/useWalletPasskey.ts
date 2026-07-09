import type {
  OpenWalletFromPasskeyResult,
  PasskeyCeremony,
} from "@lightninglabs/walletdk-core";
import { useCallback, useEffect, useState } from "react";
import { useWalletEngine } from "./provider";
import { useWalletMutationState } from "./useWalletMutation";

/**
 * Pairs the daemon-side open result with the credential id that was used, so
 * the app can persist it and scope future unlocks.
 */
export type PasskeyWalletOutcome = {
  /** The result returned by opening the wallet from the passkey. */
  result: OpenWalletFromPasskeyResult;
  /** The credential id used in the ceremony, for persistence and scoping. */
  credentialId: string;
};

/**
 * Drives a passkey ceremony and opens the wallet through the engine, which
 * refetches info and refreshes in the background so the phase advances
 * automatically. The ceremony is injected (browser: webPasskeyCeremony from
 * walletdk-web; native transports supply their own), which keeps
 * walletdk-react transport-free.
 * Creation and opening track separately because apps render them on different
 * screens. A cancelled ceremony (PasskeyCancelledError) rejects but is never
 * recorded into createError/openError. Must be used inside WalletDKProvider.
 */
export function useWalletPasskey(ceremony: PasskeyCeremony): {
  /**
   * Whether the environment supports passkey PRF. Null while the support
   * probe is in flight; render a brief loading state rather than assuming
   * either answer.
   */
  supported: boolean | null;
  /** Registers a passkey and creates the wallet from it. */
  create: (appName: string) => Promise<PasskeyWalletOutcome>;
  createPending: boolean;
  createError: Error | null;
  resetCreate: () => void;
  /**
   * Asserts a passkey (scoped when credentialId is set, discoverable
   * otherwise) and imports/unlocks the wallet.
   */
  open: (credentialId?: string) => Promise<PasskeyWalletOutcome>;
  openPending: boolean;
  openError: Error | null;
  resetOpen: () => void;
} {
  const engine = useWalletEngine();
  const [supported, setSupported] = useState<boolean | null>(null);
  const createM = useWalletMutationState<PasskeyWalletOutcome>();
  const openM = useWalletMutationState<PasskeyWalletOutcome>();

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

  const openFromPrf = useCallback(
    async (prfOutput: string, credentialId: string): Promise<PasskeyWalletOutcome> => {
      const result = await engine.openWalletFromPasskey({ prfOutput });

      return { result, credentialId };
    },
    [engine],
  );

  const create = useCallback(
    (appName: string) =>
      createM.track(async () => {
        const { prfOutput, credentialId } =
          await ceremony.registerPasskeyWallet(appName);

        return openFromPrf(prfOutput, credentialId);
      }),
    [createM.track, ceremony, openFromPrf],
  );

  const open = useCallback(
    (credentialId?: string) =>
      openM.track(async () => {
        const assertion = await ceremony.assertPasskeyPrf(credentialId);

        return openFromPrf(assertion.prfOutput, assertion.credentialId);
      }),
    [openM.track, ceremony, openFromPrf],
  );

  return {
    supported,
    create,
    createPending: createM.pending,
    createError: createM.error,
    resetCreate: createM.reset,
    open,
    openPending: openM.pending,
    openError: openM.error,
    resetOpen: openM.reset,
  };
}
