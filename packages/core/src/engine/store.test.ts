import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotStore } from './store.ts';
import { INITIAL_SNAPSHOT } from './snapshot.ts';

describe('SnapshotStore', () => {
  it('starts at the initial snapshot', () => {
    const store = new SnapshotStore();
    assert.deepEqual(store.getSnapshot(), INITIAL_SNAPSHOT);
  });

  it('update patches immutably and notifies subscribers', () => {
    const store = new SnapshotStore();
    const before = store.getSnapshot();
    let notified = 0;
    store.subscribe(() => { notified += 1; });
    store.update({ phase: 'runtimeReady' });
    assert.equal(notified, 1);
    assert.equal(store.getSnapshot().phase, 'runtimeReady');
    assert.notEqual(store.getSnapshot(), before);
    assert.equal(before.phase, 'loading');
  });

  it('unsubscribe stops notifications', () => {
    const store = new SnapshotStore();
    let notified = 0;
    const unsub = store.subscribe(() => { notified += 1; });
    unsub();
    store.update({ phase: 'error' });
    assert.equal(notified, 0);
  });

  it('a throwing listener does not block other listeners', () => {
    const store = new SnapshotStore();
    let second = 0;
    store.subscribe(() => { throw new Error('bad listener'); });
    store.subscribe(() => { second += 1; });
    store.update({ phase: 'stopped' });
    assert.equal(second, 1);
  });
});
