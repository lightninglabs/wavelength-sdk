const { test, expect, chromium } = require('@playwright/test');
const { mkdtemp, rm, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

const extension = path.join(__dirname, 'dist');
let profile, context, extensionID;

async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  extensionID = new URL(worker.url()).host;
}

async function popup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionID}/popup.html`);
  await page.waitForFunction(() => Boolean(window.probe));
  return page;
}

async function call(page, command, value) {
  return page.evaluate(([command, value]) => window.probe.call(command, value), [command, value]);
}

test.beforeEach(async () => {
  profile = await mkdtemp(path.join(tmpdir(), 'wavelength-extension-'));
  await launch();
});

test.afterEach(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

test('managed OPFS survives popup, service-worker, owner and browser restarts', async ({}, testInfo) => {
  let page = await popup();
  const capabilities = await call(page, 'capabilities');
  expect(capabilities.workerConstructor).toBe('undefined');
  await page.evaluate(() => window.probe.appWrite('app-owned record'));
  const written = await call(page, 'storageWrite', 'durable fixture checkpoint');
  expect(written.ok).toBe(true);
  expect(written.isolated).toBe(true);
  expect(written.value).toBe('durable fixture checkpoint');

  const competitor = await call(page, 'competingWriter');
  expect(competitor.ok).toBe(false);
  expect(competitor.name).toBe('NoModificationAllowedError');

  // The popup is an ordinary extension document opened in a tab so its
  // destruction is deterministic. This does not measure toolbar-popup UX.
  await page.close();
  page = await popup();
  const reopened = await call(page, 'storageRead');
  expect(reopened).toMatchObject({ ok: true, generation: written.generation, value: written.value });

  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(async () => (await call(page, 'capabilities')).generation)
    .not.toBe(capabilities.generation);
  const afterServiceWorker = await call(page, 'storageRead');
  expect(afterServiceWorker).toMatchObject({ ok: true, generation: written.generation, value: written.value });
  await cdp.detach();

  // The owner never closes its OPFS handle explicitly. Destroying the document
  // terminates its worker; only the already-flushed marker is promised here.
  await call(page, 'closeOwner');
  const afterOwner = await call(page, 'storageRead');
  expect(afterOwner.ok).toBe(true);
  expect(afterOwner.generation).not.toBe(written.generation);
  expect(afterOwner.value).toBe(written.value);
  expect(await page.evaluate(() => window.probe.appRead())).toBe('app-owned record');

  await context.close();
  await launch();
  page = await popup();
  const afterBrowser = await call(page, 'storageRead');
  expect(afterBrowser.ok).toBe(true);
  expect(afterBrowser.generation).not.toBe(afterOwner.generation);
  expect(afterBrowser.value).toBe(written.value);
  expect(await page.evaluate(() => window.probe.appRead())).toBe('app-owned record');

  await testInfo.attach('storage-evidence', {
    body: JSON.stringify({ capabilities, written, competitor, reopened,
      afterServiceWorker, afterOwner, afterBrowser }, null, 2),
    contentType: 'application/json',
  });
});

for (const mode of ['worker', 'main']) {
  test(`packaged ${mode} runtime boots under the MV3 content security policy`, async ({}, testInfo) => {
    const page = await popup();
    const result = await call(page, 'sdkReady', mode);
    await testInfo.attach('runtime-result', {
      body: JSON.stringify(result, null, 2), contentType: 'application/json',
    });
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  });

  test(`packaged ${mode} runtime rejects modified bootstrap bytes`, async () => {
    // Only mutate this build's disposable unpacked extension, then restore it.
    const script = path.join(extension, 'runtime/wasm_exec.js');
    const original = await readFile(script);
    try {
      await writeFile(script, Buffer.concat([original, Buffer.from('\n// mismatched fixture bytes\n')]));
      const page = await popup();
      const result = await call(page, 'sdkReady', mode);
      expect(result).toMatchObject({ ok: false, code: 'asset_integrity_failed' });
    } finally { await writeFile(script, original); }
  });
}

test('Wavelength wallet and invoice reopen after losing the offscreen owner', async ({}, testInfo) => {
  const password = require('node:crypto').randomUUID();
  let page = await popup();
  await page.evaluate(() => window.probe.appWrite('separate app database'));
  const original = await call(page, 'walletOpen', { password, allowCreate: true });
  expect(original.identity).toMatch(/^[0-9a-f]+$/i);
  const receive = await call(page, 'walletReceive');
  expect(receive.invoice).toMatch(/^lnbcrt/);
  expect(receive.entry.id).toBeTruthy();
  expect(await call(page, 'walletCompetitor')).toEqual({ ok: false, code: 'wallet_locked' });

  await page.close();
  page = await popup();
  expect(await call(page, 'walletSnapshot')).toMatchObject({
    generation: original.generation, identity: original.identity,
  });

  const workerBefore = await call(page, 'capabilities');
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await expect.poll(async () => (await call(page, 'capabilities')).generation)
    .not.toBe(workerBefore.generation);
  await cdp.detach();
  expect(await call(page, 'walletSnapshot')).toMatchObject({
    generation: original.generation, identity: original.identity,
  });

  await call(page, 'closeOwner');
  const recovered = await call(page, 'walletOpen', { password, allowCreate: false });
  expect(recovered.generation).not.toBe(original.generation);
  expect(recovered.identity).toBe(original.identity);
  const matching = recovered.entries.filter(entry => entry.id === receive.entry.id);
  expect(matching).toHaveLength(1);
  expect(matching[0].request.lightningInvoice).toBe(receive.invoice);
  expect(await page.evaluate(() => window.probe.appRead())).toBe('separate app database');

  await context.close();
  await launch();
  page = await popup();
  const afterBrowser = await call(page, 'walletOpen', { password, allowCreate: false });
  expect(afterBrowser.identity).toBe(original.identity);
  expect(afterBrowser.generation).not.toBe(recovered.generation);
  const persisted = afterBrowser.entries.filter(entry => entry.id === receive.entry.id);
  expect(persisted).toHaveLength(1);
  expect(persisted[0].request.lightningInvoice).toBe(receive.invoice);
  expect(await page.evaluate(() => window.probe.appRead())).toBe('separate app database');
  await testInfo.attach('wallet-recovery', {
    body: JSON.stringify({ original, recovered, afterBrowser }, null, 2),
    contentType: 'application/json',
  });
});
