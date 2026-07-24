import { phaseFromInfo, type RuntimePhase, type WalletInfo } from '../state.ts';

/**
 * Events the engine dispatches into the phase machine. Events carry no
 * behavior; the engine applies snapshot patches and process changes
 * separately, so transition() stays a pure phase -> phase map.
 */
export type WalletEngineEvent =
  | { type: 'runtimeReady' }
  | { type: 'runtimeFailed' }
  | { type: 'runtimeStopped' }
  | { type: 'startRequested' }
  | { type: 'startFailed' }
  | { type: 'infoReceived'; info: WalletInfo }
  | { type: 'restoreRequested' }
  | { type: 'walletBecameReady' }
  | { type: 'restoreFailedWalletUp' }
  | { type: 'restoreFailedWalletDown' }
  | { type: 'walletAdoptionFailed' }
  | { type: 'streamLost' }
  | { type: 'syncPollExhausted' }
  | { type: 'backgroundRefreshExhausted' }
  | { type: 'stopRequested' }
  | { type: 'stopCompleted' }
  | { type: 'stopFailed' };

/**
 * The pure phase transition table. Any (event, phase) pair without an entry is
 * an identity transition: the event is ignored. Notably, infoReceived has no
 * entry for 'restoring': during a restore the transient locked-looking
 * states InitWallet passes through cannot leak into the UI.
 */
export function transition(
  phase: RuntimePhase,
  event: WalletEngineEvent,
): RuntimePhase {
  switch (event.type) {
  case 'runtimeReady':
    return phase === 'loading' ? 'runtimeReady' : phase;

  case 'runtimeFailed':
    // 'stopped' is accepted alongside 'loading' for the same reason startFailed
    // accepts it: a runtime that dies before ready() settles announces its stop
    // (moving loading -> stopped) before the ready() rejection dispatches
    // runtimeFailed. Without this the boot failure would be swallowed by the
    // stop it caused, leaving the host on a generic stopped screen. Unlike a
    // start failure, a runtime that failed to load is a genuine error worth
    // surfacing even if a stop coincided, so this needs no deliberate-stop
    // guard: a clean stop during loading never produces a runtimeFailed.
    return phase === 'loading' || phase === 'stopped' ? 'error' : phase;

  case 'runtimeStopped':
    // A clean stop or a runtime crash; either way the engine is gone, so
    // this wins over every phase except 'error'. An error outranks the stop
    // that caused it: a runtime dying because a start failed announces both
    // the failure and the stop, in an order that depends on transport timing
    // (a synchronous emit lands before the rejection, one deferred behind an
    // async lock release lands after), and the host must end on the failure
    // either way. Preserving 'error' here is what frees transports from
    // ordering their rejection against their stop event. A clean stop never
    // passes through 'error', so it is unaffected, and startRequested still
    // exits 'error', so retry flows are too.
    //
    // This preserves 'error' for every error, not only a start failure: a
    // live-runtime error (a lost activity stream, refresh-budget exhaustion)
    // followed by a runtime death also stays on 'error' rather than moving to
    // 'stopped'. That is intentional: an error screen is a safe terminal state
    // the host recovers from with a retry (startRequested exits it), and
    // scoping the rule to start failures would mean tracking which error is in
    // flight for a difference the user does not feel.
    return phase === 'error' ? phase : 'stopped';

  case 'startRequested':
    return phase === 'stopping' ? phase : 'starting';

  case 'startFailed':
    // 'stopped' is accepted alongside 'starting' because a runtime that dies
    // mid-start announces the stop before the start rejection has finished
    // propagating. Without this the failure would be swallowed by the stop
    // that it caused, leaving the host on a generic stopped screen with no
    // way to show (for instance) that the wallet is open in another tab.
    return phase === 'starting' || phase === 'stopped' ? 'error' : phase;

  case 'infoReceived':
    switch (phase) {
    case 'starting':
    case 'needsWallet':
    case 'locked':
    case 'syncing':
    case 'ready':
      return phaseFromInfo(event.info);

    default:
      return phase;
    }

  case 'restoreRequested':
    return phase === 'needsWallet' || phase === 'locked' ? 'restoring' : phase;

  case 'walletBecameReady':
    return phase === 'restoring' || phase === 'syncing' ? 'ready' : phase;

  case 'restoreFailedWalletUp':
    return phase === 'restoring' ? 'ready' : phase;

  case 'restoreFailedWalletDown':
    return phase === 'restoring' ? 'needsWallet' : phase;

  case 'walletAdoptionFailed':
    return phase === 'needsWallet' || phase === 'locked' ? 'error' : phase;

  case 'streamLost':
  case 'backgroundRefreshExhausted':
    return phase === 'ready' ? 'error' : phase;

  case 'syncPollExhausted':
    return phase === 'syncing' ? 'error' : phase;

  case 'stopRequested':
    return phase === 'stopping' || phase === 'stopped' ? phase : 'stopping';

  case 'stopCompleted':
    return phase === 'stopping' ? 'stopped' : phase;

  case 'stopFailed':
    return phase === 'stopping' ? 'error' : phase;
  }
}
