import { useEffect, useRef } from 'react';
import { Entry, useWalletDK } from '@lightninglabs/walletdk-react';

// Whether any pending entry belongs to an on-chain rail that the activity stream
// does not push (boarding deposits and exits/leaves). Lightning and credit
// send/receive are stream-backed, so an unpaid invoice or an in-flight LN
// payment must NOT trigger polling. Used to scope the demo's stopgap poll.
export function hasPendingOnchain(activity: Entry[]): boolean {
  return activity.some(
    (e) =>
      e.status === 'pending' && (e.kind === 'deposit' || e.kind === 'exit'),
  );
}

// TEMPORARY (remove once the daemon emits on-chain deposit events).
//
// The daemon's activity stream (SubscribeWallet) only pushes live updates for
// swap-backed and send-side entries; on-chain boarding deposits never emit a
// lifecycle event, so a boarding receive does not update the UI on its own. The
// SDK provider stays push-driven on purpose, so the demo polls refresh() while
// the user is waiting on a boarding address. Once darepo-client emits the
// boarding/deposit lifecycle to SubscribeWallet, delete this hook and its call
// sites; the provider's activity stream will cover it.
//
// Tracking: https://github.com/lightninglabs/darepo-client/issues/875
export function usePollWhileWaiting(active: boolean, intervalMs = 3000): void {
  const { refresh } = useWalletDK();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => {
      void refreshRef.current().catch(() => undefined);
    }, intervalMs);

    return () => clearInterval(id);
  }, [active, intervalMs]);
}
