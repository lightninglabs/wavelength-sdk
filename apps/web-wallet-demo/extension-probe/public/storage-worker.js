let handle;

self.onmessage = async ({ data: { id, command, value } }) => {
  try {
    if (!handle) {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle('wavelength-probe', { create: true });
      const file = await directory.getFileHandle('checkpoint', { create: true });
      handle = await file.createSyncAccessHandle();
    }
    if (command === 'write') {
      const bytes = new TextEncoder().encode(value);
      handle.truncate(0);
      handle.write(bytes, { at: 0 });
      handle.flush();
    }
    const bytes = new Uint8Array(handle.getSize());
    handle.read(bytes, { at: 0 });
    self.postMessage({ id, ok: true, value: new TextDecoder().decode(bytes) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message, name: error.name });
  }
};
