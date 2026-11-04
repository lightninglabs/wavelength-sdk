const generation = crypto.randomUUID();
let creating;

async function ensureOwner() {
  if (creating) return creating;
  creating = (async () => {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('owner.html')],
    });
    if (!existing.length) {
      await chrome.offscreen.createDocument({
        url: 'owner.html',
        reasons: ['WORKERS'],
        justification: 'Test a dedicated worker owning persistent wallet storage.',
      });
    }
  })();
  try { await creating; } finally { creating = undefined; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'background') return;
  (async () => {
    if (message.command === 'capabilities') {
      return { generation, workerConstructor: typeof Worker,
        opfs: typeof navigator.storage?.getDirectory === 'function' };
    }
    if (message.command === 'closeOwner') {
      await chrome.offscreen.closeDocument();
      return true;
    }
    await ensureOwner();
    return chrome.runtime.sendMessage({ ...message, target: 'owner' });
  })().then(value => respond({ ok: true, value }), error => {
    respond({ ok: false, error: error.message });
  });
  return true;
});
