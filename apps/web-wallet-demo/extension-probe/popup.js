// Expose only fixture operations. There is no payment/signing bridge and this
// extension has neither content scripts nor externally_connectable origins.
window.probe = {
  async call(command, value) {
    const response = await chrome.runtime.sendMessage({
      target: 'background', command, value,
    });
    if (!response.ok) throw new Error(response.error);
    return response.value;
  },
  async appWrite(value) { await chrome.storage.local.set({ businessRecord: value }); },
  async appRead() { return (await chrome.storage.local.get('businessRecord')).businessRecord; },
};
