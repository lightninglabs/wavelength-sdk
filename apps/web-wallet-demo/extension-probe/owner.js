import { createWebClient } from '@lightninglabs/wavelength-web';

const generation = crypto.randomUUID();
let storageWorker;
let sequence = 0;
const pending = new Map();
let wallet;
const walletConfig = {
  network: 'regtest', dataDir: '/extension-probe', walletType: 'lwwallet',
  arkServerAddress: 'http://127.0.0.1:8806', arkServerInsecure: true,
  swapServerAddress: 'http://127.0.0.1:8806', swapServerInsecure: true,
  walletEsploraUrl: 'http://127.0.0.1:8806', debugLevel: 'off',
};

function newClient(options = {}) {
  return createWebClient({ runtimeBaseUrl: chrome.runtime.getURL('runtime/'), ...options });
}

async function walletSnapshot() {
  const info = await wallet.getInfo();
  const history = await wallet.list();
  return { generation, identity: info.identityPubKey, state: info.walletState,
    entries: history.activity?.entries || [] };
}

function storageCall(command, value) {
  if (!storageWorker) {
    storageWorker = new Worker(chrome.runtime.getURL('storage-worker.js'));
    storageWorker.onmessage = ({ data }) => {
      const resolve = pending.get(data.id);
      pending.delete(data.id);
      resolve?.(data);
    };
  }
  const id = ++sequence;
  return new Promise(resolve => {
    pending.set(id, resolve);
    storageWorker.postMessage({ id, command, value });
  });
}

async function execute(command, value) {
  if (command === 'walletOpen') {
    // Password lives only in the test and this invocation. No seed or password
    // is returned to the popup or stored in chrome.storage.
    if (wallet) throw new Error('This fixture already owns an open wallet');
    wallet = newClient();
    await wallet.start(walletConfig);
    const info = await wallet.getInfo();
    if (info.walletState === 'none' && value.allowCreate) {
      await wallet.createWallet({ password: value.password });
    } else if (info.walletState === 'locked') {
      await wallet.unlockWallet({ password: value.password });
    } else {
      throw new Error(`Unexpected wallet state on open: ${info.walletState}`);
    }
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const info = await wallet.getInfo();
      if (info.walletState === 'ready' && info.serverConnected) return walletSnapshot();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Wallet services did not become ready');
  }
  if (command === 'walletReceive') {
    return wallet.receive({ amountSat: 1000, memo: 'Extension storage probe' });
  }
  if (command === 'walletSnapshot') return walletSnapshot();
  if (command === 'walletCompetitor') {
    const competitor = newClient();
    try {
      await competitor.start(walletConfig);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error.code };
    } finally { competitor.dispose(); }
  }
  if (command === 'storageWrite' || command === 'storageRead') {
    const result = await storageCall(command === 'storageWrite' ? 'write' : 'read', value);
    return { ...result, generation, isolated: crossOriginIsolated };
  }
  if (command === 'competingWriter') {
    const competitor = new Worker(chrome.runtime.getURL('storage-worker.js'));
    try {
      return await new Promise(resolve => {
        competitor.onmessage = ({ data }) => resolve(data);
        competitor.postMessage({ id: 1, command: 'read' });
      });
    } finally { competitor.terminate(); }
  }
  if (command === 'sdkReady') {
    const client = newClient({ runtimeThread: value === 'main' ? 'main' : 'worker' });
    try {
      await client.ready();
      return { ok: true, generation };
    } catch (error) {
      return { ok: false, error: error.message, code: error.code };
    } finally { client.dispose(); }
  }
  throw new Error('Unknown fixture command');
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'owner') return;
  execute(message.command, message.value)
    .then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
