import { useEffect, useRef } from 'react';
import { Balance, Entry, useWalletDK } from '@lightninglabs/walletdk-react';

// Whether there is pending on-chain work the activity stream will not push to
// completion. Two signals: a pending deposit/exit entry, or a balance reporting
// boarding funds still settling. The balance leads the activity list for a
// boarding deposit (pendingInSat is set a poll or two before the row appears),
// so keying on it too keeps the poll alive until the row lands.
//
// Both balance fields cover boarding only: the daemon sets pendingInSat from the
// confirmed/unconfirmed/adopted boarding totals and pendingOutSat from the
// pending boarding sweep. An in-flight Lightning receive or on-chain send never
// shows up there, which is why the entry-kind arm carries exit tracking and why
// an unpaid invoice never starts a poll.
export function hasPendingOnchain(
  activity: Entry[],
  balance?: Balance | null,
): boolean {
  const pendingEntry = activity.some(
    (e) =>
      e.status === 'pending' && (e.kind === 'deposit' || e.kind === 'exit'),
  );
  if (pendingEntry) {
    return true;
  }
  const pendingIn = balance?.pendingInSat ?? 0;
  const pendingOut = balance?.pendingOutSat ?? 0;

  return pendingIn > 0 || pendingOut > 0;
}

// POLL_MAX_TICKS bounds a single polling run. A unilateral exit stays pending
// for its CSV timelock, which is hours to days, so an unbounded poll would wake
// the JS thread for the life of the app. Give up after roughly ten minutes and
// let the manual refresh take over.
const POLL_MAX_TICKS = 200;

// POLL_FAILURE_LIMIT stops the poll once the daemon has stopped answering,
// mirroring the provider's own give-up thresholds rather than retrying forever.
const POLL_FAILURE_LIMIT = 5;

// TEMPORARY (remove once the daemon emits on-chain lifecycle events).
//
// The daemon's activity stream (SubscribeWallet) only pushes live updates for
// swap-backed and send-side entries. On-chain boarding deposits never emit a
// lifecycle event, and neither do exits, so an on-chain receive or exit does not
// update the UI on its own. The SDK provider stays push-driven on purpose, so the
// demo polls refresh() while such work is outstanding.
//
// darepo-client#875 tracks emitting the boarding/deposit lifecycle. That alone
// retires the deposit half; the exit half needs the same treatment before this
// hook and its call sites can be deleted outright.
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
    let ticks = 0;
    let failures = 0;
    let inFlight = false;

    const id = setInterval(() => {
      // A refresh slower than the interval must not stack up behind itself.
      if (inFlight) {
        return;
      }
      ticks += 1;
      if (ticks > POLL_MAX_TICKS) {
        clearInterval(id);

        return;
      }
      inFlight = true;
      void refreshRef
        .current()
        .then(
          () => {
            failures = 0;
          },
          () => {
            failures += 1;
            if (failures >= POLL_FAILURE_LIMIT) {
              clearInterval(id);
            }
          },
        )
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);

    return () => clearInterval(id);
  }, [active, intervalMs]);
}
