import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BaseWavelengthClient } from './base-client.ts';
import type { WavelengthEvent } from './events.ts';
import { FACADE_METHODS, type FacadeMethod } from './facade.ts';
import { WavelengthError } from './errors.ts';
import { FORCE_UNROLL_ACK } from './requests.ts';
import type { ActivityStreamOptions } from './activity-options.ts';

// A fake transport that records every raw facade invocation and replays canned
// responses, so the verb mapping is testable without any runtime.
class FakeClient extends BaseWavelengthClient {
  protected readonly serverTransport = 'grpc' as const;
  calls: Array<{ method: string; params: unknown }> = [];
  responses = new Map<string, unknown>();
  activityOpens: ActivityStreamOptions[] = [];

  ready(): Promise<void> {
    return Promise.resolve();
  }

  protected invokeFacade<T = unknown>(
    method: FacadeMethod,
    params: unknown = {},
  ): Promise<T> {
    this.calls.push({ method, params });
    return Promise.resolve((this.responses.get(method) ?? {}) as T);
  }

  protected openActivityStream(opts: ActivityStreamOptions): Promise<void> {
    this.activityOpens.push(opts);
    return Promise.resolve();
  }

  stopActivity(): void {}
}

describe('BaseWavelengthClient', () => {
  it('callFacade accepts every portable method and rejects worker/raw verbs', async () => {
    const client = new FakeClient();
    for (const method of FACADE_METHODS) {
      // start/stop are guarded (asserted separately below); they run only
      // through the typed start()/stop().
      if (method === 'start' || method === 'stop') {
        continue;
      }
      await client.callFacade(method);
    }
    await assert.rejects(
      () => (client.callFacade as (method: string) => Promise<unknown>)('subscribe'),
      (err: WavelengthError) => err.code === 'unsupported_facade_method',
    );
    await assert.rejects(
      () => (client.callFacade as (method: string) => Promise<unknown>)('$ready'),
      (err: WavelengthError) => err.code === 'unsupported_facade_method',
    );
  });

  it('callFacade rejects the lifecycle verbs so the runtime lock is not bypassed', async () => {
    const client = new FakeClient();
    for (const verb of ['start', 'stop'] as const) {
      await assert.rejects(
        () => client.callFacade(verb),
        (err: unknown) => {
          assert.ok(err instanceof WavelengthError);
          assert.match(err.message, new RegExp(`Call ${verb}\\(\\)`));

          return true;
        },
      );
      // The guard rejects before anything reaches the transport.
      assert.equal(client.calls.some((call) => call.method === verb), false);
    }

    // The typed methods still dispatch the same verbs through the internal path.
    client.responses.set('getInfo', { walletState: 2 });
    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });
    await client.stop();
    assert.deepEqual(
      client.calls.map((call) => call.method),
      ['start', 'getInfo', 'stop'],
    );
  });

  it('callFacade normalizes raw facade values once in core', async () => {
    const client = new FakeClient();
    client.responses.set('list', {
      View: 'activity',
      Activity: { Entries: null },
      VTXOs: null,
      Onchain: null,
    });
    assert.deepEqual(await client.callFacade('list'), {
      view: 'activity',
      activity: { entries: [] },
      vtxos: undefined,
      onchain: undefined,
    });
  });

  it('isRunning returns the facade boolean', async () => {
    const client = new FakeClient();
    client.responses.set('isRunning', true);
    assert.equal(await client.isRunning(), true);
  });
  it('start maps the config through the transport knob and fetches info', async () => {
    const client = new FakeClient();
    client.responses.set('getInfo', { walletState: 2 });
    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

    const start = client.calls[0];
    assert.equal(start.method, 'start');
    const cfg = start.params as { server_transport?: string; server_address?: string };
    assert.equal(cfg.server_transport, 'grpc');
    assert.equal(cfg.server_address, 'h:7070');
    assert.equal(client.calls[1].method, 'getInfo');
  });

  it('rejects invalid config before facade start dispatch', async () => {
    const client = new FakeClient();
    await assert.rejects(
      () => client.start({ network: 'mainnet' }),
      (err: WavelengthError) => err.code === 'invalid_config',
    );
    assert.equal(client.calls.some((call) => call.method === 'start'), false);
  });

  it('createWallet sends the Go-shaped request with a base64 password', async () => {
    const client = new FakeClient();
    await client.createWallet({ password: 'pw' });
    const req = client.calls[0].params as { WalletPassword?: string };
    assert.equal(req.WalletPassword, Buffer.from('pw', 'utf8').toString('base64'));
  });

  it('sendPrepared folds the prepare-time paymentHash into the result', async () => {
    const client = new FakeClient();
    client.responses.set('sendPrepared', {});
    const result = await client.sendPrepared({
      sendIntentId: 'i1',
      paymentHash: 'ph',
    } as never);
    assert.equal(result.paymentHash, 'ph');
  });

  it('forwards list kinds and both exit variants exactly', async () => {
    const client = new FakeClient();
    await client.list({ view: 'activity', kinds: ['send', 'exit'] });
    await client.exit({ outpoint: 'tx:0', destination: 'bcrt1q...' });
    await client.exit({ outpoint: 'tx:1', forceUnrollAck: FORCE_UNROLL_ACK });
    assert.deepEqual(client.calls.map((call) => call.params), [
      { view: 'activity', kinds: ['send', 'exit'] },
      { outpoint: 'tx:0', destination: 'bcrt1q...' },
      { outpoint: 'tx:1', forceUnrollAck: FORCE_UNROLL_ACK },
    ]);
  });

  it('rejects an unsafe activity cursor before opening the transport', async () => {
    const client = new FakeClient();
    await assert.rejects(
      () => client.startActivity({ cursor: -1 }),
      (err: WavelengthError) => err.code === 'invalid_cursor',
    );
    assert.equal(client.activityOpens.length, 0);
  });

  it('stop emits runtimeStopped to subscribers', async () => {
    const client = new FakeClient();
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));
    await client.stop();
    assert.deepEqual(events, [{ type: 'runtimeStopped' }]);
  });

  it('runs the afterDaemonStopped hook before announcing the stop', async () => {
    // A transport releases exclusive resources in this hook, so it has to run
    // once the daemon is confirmed down but before a subscriber can react to
    // the stop by starting the runtime again.
    const order: string[] = [];
    class HookedClient extends FakeClient {
      protected afterDaemonStopped(): void {
        order.push('hook');
      }
    }

    const client = new HookedClient();
    client.subscribe(() => order.push('runtimeStopped'));
    await client.stop();

    assert.deepEqual(order, ['hook', 'runtimeStopped']);
  });

  it('does not run afterDaemonStopped when the stop call fails', async () => {
    let hookRuns = 0;
    class FailingStopClient extends FakeClient {
      protected invokeFacade<T = unknown>(method: FacadeMethod): Promise<T> {
        if (method === 'stop') {
          return Promise.reject(new Error('daemon did not acknowledge stop'));
        }

        return Promise.resolve({} as T);
      }
      protected afterDaemonStopped(): void {
        hookRuns += 1;
      }
    }

    const client = new FailingStopClient();
    await assert.rejects(client.stop());
    assert.equal(hookRuns, 0, 'an unacknowledged stop is not a confirmed stop');
  });

  it('dispose clears subscribers', async () => {
    const client = new FakeClient();
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));
    client.dispose();
    await client.stop();
    assert.equal(events.length, 0);
  });
});
