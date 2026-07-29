import { useCallback, useEffect, useState } from 'react';
import { loadWallets, WalletEntry } from './walletRegistry';

// useWalletRegistry exposes the wallet registry as React state. AsyncStorage
// reads are promises, so the list is null until the first load resolves;
// callers gate their first render on that. refresh() re-reads after any
// registry write.
export function useWalletRegistry(): {
  wallets: WalletEntry[] | null;
  refresh: () => void;
} {
  const [wallets, setWallets] = useState<WalletEntry[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    loadWallets().then((entries) => {
      if (live) {
        setWallets(entries);
      }
    });

    return () => {
      live = false;
    };
  }, [version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { wallets, refresh };
}
