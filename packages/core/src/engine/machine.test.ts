import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RuntimePhase, WalletInfo } from '../state.ts';
import { transition, type WalletEngineEvent } from './machine.ts';

const ALL_PHASES: RuntimePhase[] = [
  'loading', 'runtimeReady', 'starting', 'needsWallet', 'locked',
  'syncing', 'restoring', 'ready', 'stopping', 'stopped', 'error',
];

const readyInfo = { walletState: 'ready', walletReady: true } as WalletInfo;
const lockedInfo = { walletState: 'locked', walletReady: false } as WalletInfo;

// Each row: [event, from-phase, expected-to-phase]. Any (event, phase) pair
// not listed must be an identity transition, asserted exhaustively below.
const TABLE: Array<[WalletEngineEvent, RuntimePhase, RuntimePhase]> = [
  [{ type: 'runtimeReady' }, 'loading', 'runtimeReady'],
  [{ type: 'runtimeFailed' }, 'loading', 'error'],
  [{ type: 'startFailed' }, 'starting', 'error'],
  [{ type: 'infoReceived', info: readyInfo }, 'starting', 'ready'],
  [{ type: 'infoReceived', info: lockedInfo }, 'starting', 'locked'],
  [{ type: 'infoReceived', info: readyInfo }, 'syncing', 'ready'],
  // phaseFromInfo depends only on the info payload, not the incoming phase,
  // so any phase in the info-driven set (starting/needsWallet/locked/syncing/
  // ready) collapses the same way; these two round out that set for readyInfo.
  [{ type: 'infoReceived', info: readyInfo }, 'needsWallet', 'ready'],
  [{ type: 'infoReceived', info: readyInfo }, 'locked', 'ready'],
  // A ready wallet can be demoted back to locked, for example if getInfo
  // reports the daemon relocked underneath it; phaseFromInfo drives this the
  // same as any other info-driven phase.
  [{ type: 'infoReceived', info: lockedInfo }, 'ready', 'locked'],
  [{ type: 'restoreRequested' }, 'needsWallet', 'restoring'],
  [{ type: 'restoreRequested' }, 'locked', 'restoring'],
  [{ type: 'walletBecameReady' }, 'restoring', 'ready'],
  [{ type: 'walletBecameReady' }, 'syncing', 'ready'],
  [{ type: 'restoreFailedWalletUp' }, 'restoring', 'ready'],
  [{ type: 'restoreFailedWalletDown' }, 'restoring', 'needsWallet'],
  [{ type: 'walletAdoptionFailed' }, 'needsWallet', 'error'],
  [{ type: 'walletAdoptionFailed' }, 'locked', 'error'],
  [{ type: 'streamLost' }, 'ready', 'error'],
  [{ type: 'syncPollExhausted' }, 'syncing', 'error'],
  [{ type: 'backgroundRefreshExhausted' }, 'ready', 'error'],
  [{ type: 'stopCompleted' }, 'stopping', 'stopped'],
  [{ type: 'stopFailed' }, 'stopping', 'error'],
];

describe('transition table', () => {
  for (const [event, from, to] of TABLE) {
    it(`${event.type}: ${from} -> ${to}`, () => {
      assert.equal(transition(from, event), to);
    });
  }

  it('runtimeStopped wins from every phase', () => {
    for (const phase of ALL_PHASES) {
      assert.equal(transition(phase, { type: 'runtimeStopped' }), 'stopped');
    }
  });

  it('startRequested moves every phase except stopping to starting', () => {
    for (const phase of ALL_PHASES) {
      const expected = phase === 'stopping' ? 'stopping' : 'starting';
      assert.equal(transition(phase, { type: 'startRequested' }), expected);
    }
  });

  it('stopRequested moves every phase except stopping/stopped to stopping', () => {
    for (const phase of ALL_PHASES) {
      const expected =
        phase === 'stopping' || phase === 'stopped' ? phase : 'stopping';
      assert.equal(transition(phase, { type: 'stopRequested' }), expected);
    }
  });

  it('infoReceived is ignored during restoring', () => {
    assert.equal(
      transition('restoring', { type: 'infoReceived', info: lockedInfo }),
      'restoring',
    );
    assert.equal(
      transition('restoring', { type: 'infoReceived', info: readyInfo }),
      'restoring',
    );
  });

  // Events the machine handles outside the plain phase -> phase TABLE lookup:
  // covered by their own dedicated tests above, so excluded from the
  // exhaustive identity sweep below.
  const SPECIALLY_TESTED: Array<WalletEngineEvent['type']> = [
    'runtimeStopped',
    'startRequested',
    'stopRequested',
  ];

  const EVENT_TYPES: Array<WalletEngineEvent['type']> = [
    'runtimeReady',
    'runtimeFailed',
    'runtimeStopped',
    'startRequested',
    'startFailed',
    'infoReceived',
    'restoreRequested',
    'walletBecameReady',
    'restoreFailedWalletUp',
    'restoreFailedWalletDown',
    'walletAdoptionFailed',
    'streamLost',
    'syncPollExhausted',
    'backgroundRefreshExhausted',
    'stopRequested',
    'stopCompleted',
    'stopFailed',
  ];

  // One representative event per type; infoReceived carries readyInfo, which
  // is why the two extra TABLE rows above exist (phaseFromInfo(readyInfo)
  // collapses every info-driven phase to 'ready', not just 'starting' and
  // 'syncing').
  function eventOf(type: WalletEngineEvent['type']): WalletEngineEvent {
    if (type === 'infoReceived') {
      return { type, info: readyInfo };
    }

    return { type } as WalletEngineEvent;
  }

  it('every (event, phase) pair not in TABLE, and not specially tested, is an identity transition', () => {
    for (const type of EVENT_TYPES) {
      if (SPECIALLY_TESTED.includes(type)) {
        continue;
      }
      const event = eventOf(type);
      for (const phase of ALL_PHASES) {
        const inTable = TABLE.some(([e, from]) => e.type === type && from === phase);
        if (inTable) {
          continue;
        }
        assert.equal(
          transition(phase, event),
          phase,
          `${type} from ${phase} should be an identity transition`,
        );
      }
    }
  });
});
