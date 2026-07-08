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
    return phase === 'loading' ? 'error' : phase;

  case 'runtimeStopped':
    // A clean stop or a runtime crash; either way the engine is gone, so
    // this always wins.
    return 'stopped';

  case 'startRequested':
    return phase === 'stopping' ? phase : 'starting';

  case 'startFailed':
    return phase === 'starting' ? 'error' : phase;

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
