import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import type { FacadeMethod } from '@lightninglabs/wavelength-core';

const android = new URL(
  '../android/src/main/java/engineering/lightning/wavelength/reactnative/WavelengthModule.kt',
  import.meta.url,
);
const ios = new URL('../ios/WavelengthModule.mm', import.meta.url);

const nativeMethods = {
  start: ['Mobile.start', 'MobileStart'],
  stop: ['Mobile.stop', 'MobileStop'],
  getInfo: ['Mobile.getInfo', 'MobileGetInfo'],
  status: ['Mobile.status', 'MobileStatus'],
  balance: ['Mobile.balance', 'MobileBalance'],
  createWallet: ['Mobile.createWallet', 'MobileCreateWallet'],
  unlockWallet: ['Mobile.unlockWallet', 'MobileUnlockWallet'],
  openWalletFromPasskey: [
    'Mobile.openWalletFromPasskey',
    'MobileOpenWalletFromPasskey',
  ],
  deposit: ['Mobile.deposit', 'MobileDeposit'],
  receive: ['Mobile.receive', 'MobileReceive'],
  prepareSend: ['Mobile.prepareSend', 'MobilePrepareSend'],
  sendPrepared: ['Mobile.sendPrepared', 'MobileSendPrepared'],
  list: ['Mobile.list', 'MobileList'],
  exit: ['Mobile.exit', 'MobileExit'],
  exitStatus: ['Mobile.exitStatus', 'MobileExitStatus'],
  exitSummary: ['Mobile.exitSummary', 'MobileExitSummary'],
  getExitPlan: ['Mobile.getExitPlan', 'MobileGetExitPlan'],
  sweepWallet: ['Mobile.sweepWallet', 'MobileSweepWallet'],
  confirmedBalanceSat: [
    'Mobile.confirmedBalanceSat',
    'MobileConfirmedBalanceSat',
  ],
  pendingInboundSat: [
    'Mobile.pendingInboundSat',
    'MobilePendingInboundSat',
  ],
  walletReady: ['Mobile.walletReady', 'MobileWalletReady'],
  isRunning: ['Mobile.isRunning', 'MobileIsRunning'],
} as const satisfies Record<FacadeMethod, readonly [string, string]>;

const scalarMethods = {
  confirmedBalanceSat: 'integer',
  pendingInboundSat: 'integer',
  walletReady: 'boolean',
  isRunning: 'boolean',
} as const;

async function readNativeSources(): Promise<{ kt: string; mm: string }> {
  const [kt, mm] = await Promise.all([
    readFile(android, 'utf8'),
    readFile(ios, 'utf8'),
  ]);
  return { kt, mm };
}

function androidDispatch(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/^\s*"([^"]+)"\s*->\s*(?:\{\s*)?(Mobile\.\w+)\(/gm)]
      .map((match) => [match[1], match[2]]),
  );
}

function iosDispatch(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(
      /\[method isEqualToString:@"([^"]+)"\]\)\s*\{[\s\S]*?\b(Mobile[A-Z]\w*)\(/g,
    )].map((match) => [match[1], match[2]]),
  );
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);

  return source.slice(startIndex, endIndex);
}

describe('native facade dispatch', () => {
  it('maps every facade method to the matching Android and iOS entry point', async () => {
    const { kt, mm } = await readNativeSources();
    const expectedAndroid = Object.fromEntries(
      Object.entries(nativeMethods).map(([method, names]) => [method, names[0]]),
    );
    const expectedIos = Object.fromEntries(
      Object.entries(nativeMethods).map(([method, names]) => [method, names[1]]),
    );

    assert.deepEqual(androidDispatch(kt), expectedAndroid);
    assert.deepEqual(iosDispatch(mm), expectedIos);
  });

  for (const [method, kind] of Object.entries(scalarMethods)) {
    it(`serializes the ${method} ${kind} as JSON text`, async () => {
      const { kt, mm } = await readNativeSources();
      const [androidMethod, iosMethod] =
        nativeMethods[method as keyof typeof scalarMethods];

      assert.match(
        kt,
        new RegExp(
          `"${method}"\\s*->\\s*${androidMethod.replace('.', '\\.')}\\(\\)\\.toString\\(\\)`,
        ),
      );
      if (method === 'isRunning') {
        assert.match(
          mm,
          new RegExp(`json = ${iosMethod}\\(\\) \\? @"true" : @"false"`),
        );
        return;
      }
      if (kind === 'boolean') {
        assert.match(mm, /BOOL value = NO;/);
        assert.match(mm, new RegExp(`${iosMethod}\\(&value, &error\\);`));
        assert.match(mm, /json = value \? @"true" : @"false";/);
        return;
      }
      assert.match(mm, /int64_t value = 0;/);
      assert.match(mm, new RegExp(`${iosMethod}\\(&value, &error\\);`));
      assert.match(
        mm,
        /json = \[NSString stringWithFormat:@"%lld",\s*\(long long\)value\]/,
      );
    });
  }

  it('detaches a stopped subscription before close and identifies its old pump by identity', async () => {
    const { kt, mm } = await readNativeSources();
    const androidStop = section(
      kt,
      'override fun stopActivity',
      '// pump drains the facade',
    );
    const iosStop = section(
      mm,
      '- (void)stopActivity:',
      '// pump drains the subscription',
    );
    const androidPump = section(kt, 'private fun pump', 'private fun sendEvent');
    const iosPump = section(mm, '- (void)pump:', '- (std::shared_ptr');

    assert.match(androidStop, /subscription\s*=\s*null/);
    assert.ok(
      androidStop.indexOf('subscription = null') < androidStop.indexOf('sub?.close()'),
      'Android must detach the stopped subscription before close()',
    );
    assert.match(androidPump, /subscription\s*!==\s*sub/);
    assert.match(androidPump, /if\s*\(stopped\)\s*\{\s*break\s*\}/);
    assert.equal(
      androidPump.match(/subscription\s*!==\s*sub/g)?.length,
      2,
      'Android must re-check ownership before emitting an entry',
    );

    assert.match(iosStop, /self->_subscription\s*=\s*nil/);
    assert.ok(
      iosStop.indexOf('self->_subscription = nil') < iosStop.indexOf('[sub close:&error]'),
      'iOS must detach the stopped subscription before close',
    );
    assert.match(iosPump, /self->_subscription\s*!=\s*sub/);
    assert.match(iosPump, /if\s*\(stopped\)\s*\{\s*break;\s*\}/);
    assert.equal(
      iosPump.match(/self->_subscription\s*!=\s*sub/g)?.length,
      2,
      'iOS must re-check ownership before emitting an entry',
    );
  });
});
