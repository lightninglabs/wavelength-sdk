import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { restorePreimages } from './engine.ts';
import { ActivityStream } from './activity.ts';
import type { Entry } from '../results.ts';

// A send's preimage is proof of payment: it is the only thing a caller can
// show a third party to demonstrate that an invoice actually settled. The
// daemon reveals it exactly once, on the stream entry it pushes when the swap
// completes, and every list read afterwards returns the entry with the field
// empty.
//
// These tests pin the two halves that keep it reachable: the stream remembers
// what it saw, and the refresh puts it back.

function entry(over: Partial<Entry> & { progress?: Partial<Entry['progress']> }): Entry {
  return {
    id: 'e1',
    kind: 'send',
    status: 'complete',
    amountSat: -1000,
    cursor: 1,
    ...over,
    progress: {
      phase: 'confirmed',
      phaseLabel: 'confirmed',
      paymentHash: 'hash-1',
      txid: '',
      confirmationHeight: 0,
      vTXOOutpoint: '',
      preimage: '',
      ...over.progress,
    },
  } as Entry;
}

describe('restorePreimages', () => {
  it('puts back a preimage the list snapshot dropped', () => {
    const got = restorePreimages(
      [entry({})],
      new Map([['hash-1', 'pre-1']]),
    );

    assert.equal(got[0]?.progress?.preimage, 'pre-1');
  });

  it('leaves an entry that already carries one alone', () => {
    const rows = [entry({ progress: { preimage: 'from-stream' } })];

    const got = restorePreimages(rows, new Map([['hash-1', 'stale']]));

    assert.equal(got[0]?.progress?.preimage, 'from-stream');
    assert.equal(got[0], rows[0], 'an untouched entry should not be copied');
  });

  it('never invents a preimage it was not given', () => {
    const rows = [entry({})];

    const got = restorePreimages(rows, new Map([['other-hash', 'pre']]));

    assert.equal(got[0]?.progress?.preimage, '');
    assert.equal(got[0], rows[0]);
  });

  it('is a no-op when nothing has been seen', () => {
    const rows = [entry({})];

    assert.equal(restorePreimages(rows, new Map()), rows);
  });

  it('does not mutate the entry it was handed', () => {
    const rows = [entry({})];

    restorePreimages(rows, new Map([['hash-1', 'pre-1']]));

    assert.equal(
      rows[0]?.progress?.preimage,
      '',
      'the caller’s array must be left as it was',
    );
  });
});

describe('ActivityStream preimage capture', () => {
  function stream() {
    const s = new ActivityStream({
      client: {
        startActivity: () => Promise.resolve(),
        stopActivity: () => Promise.resolve(),
      },
      onActivity: () => {},
      onReconcile: () => {},
      onDead: () => {},
    });
    s.start();

    return s;
  }

  it('remembers a preimage before the entry body is discarded', () => {
    const s = stream();

    s.noteActivity(
      entry({ cursor: 2, progress: { preimage: 'pre-1' } }),
    );

    assert.equal(s.preimageFor('hash-1'), 'pre-1');
    s.stop();
  });

  it('ignores an entry that carries no preimage yet', () => {
    const s = stream();

    s.noteActivity(entry({ cursor: 2 }));

    assert.equal(s.preimageFor('hash-1'), undefined);
    s.stop();
  });

  it('forgets everything on stop, so a new wallet starts clean', () => {
    const s = stream();
    s.noteActivity(entry({ cursor: 2, progress: { preimage: 'pre-1' } }));

    s.stop();

    assert.equal(s.preimageFor('hash-1'), undefined);
  });

  it('drops events once stopped', () => {
    const s = stream();
    s.stop();

    s.noteActivity(entry({ cursor: 2, progress: { preimage: 'pre-1' } }));

    assert.equal(s.preimageFor('hash-1'), undefined);
  });
});
