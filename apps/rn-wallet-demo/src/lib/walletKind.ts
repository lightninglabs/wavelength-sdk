import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalletKind } from '@lightninglabs/wavelength-react';

// The demo always uses the default data dir, so fixed keys are enough (the
// web demo keys the same markers by data dir because its form lets the dir
// vary). The credential key predates this file: it was introduced with the
// passkey wiring and existing installs may already hold a value under it.
const KIND_KEY = 'walletdk.walletKind';
const CREDENTIAL_KEY = 'walletdk.passkeyCredentialId';

// readWalletKind returns the recorded unlock mode, or null when unknown.
async function readWalletKind(): Promise<WalletKind | null> {
  const v = await AsyncStorage.getItem(KIND_KEY);

  return v === 'passkey' || v === 'password' ? v : null;
}

// UseWalletKind is the app-side view of the stored wallet markers.
export type UseWalletKind = {
  kind: WalletKind | null;
  credentialId: string | null;
  // record stores the kind (and the passkey credential id when given) after a
  // successful create or unlock.
  record: (kind: WalletKind, credentialId?: string) => Promise<void>;
  // clear removes both markers; the wipe flow calls it.
  clear: () => Promise<void>;
};

// useWalletKind loads the stored wallet kind and passkey credential id once
// and keeps them in state; AsyncStorage is async where the web demo's
// localStorage was sync, so consumers read the hook state instead.
export function useWalletKind(): UseWalletKind {
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([readWalletKind(), AsyncStorage.getItem(CREDENTIAL_KEY)]).then(
      ([storedKind, storedCred]) => {
        if (!cancelled) {
          setKind(storedKind);
          setCredentialId(storedCred);
        }
      },
      () => undefined,
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const record = useCallback(
    async (nextKind: WalletKind, nextCredentialId?: string) => {
      setKind(nextKind);
      const writes: Array<[string, string]> = [[KIND_KEY, nextKind]];
      if (nextCredentialId) {
        setCredentialId(nextCredentialId);
        writes.push([CREDENTIAL_KEY, nextCredentialId]);
      }
      await AsyncStorage.multiSet(writes).catch(() => undefined);
    },
    [],
  );

  const clear = useCallback(async () => {
    setKind(null);
    setCredentialId(null);
    await AsyncStorage.multiRemove([KIND_KEY, CREDENTIAL_KEY]).catch(
      () => undefined,
    );
  }, []);

  return { kind, credentialId, record, clear };
}
