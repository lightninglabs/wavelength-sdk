import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import {
  createNativeClient,
  getDefaultDataDir,
} from '@lightninglabs/wavelength-react-native';

/** Check the on-disk database after the daemon has closed its connections. */
function assertDatabase(file: File): void {
  if (!file.exists || file.size < 100) {
    throw new Error(`Missing or empty database: ${file.name}`);
  }

  const handle = file.open(FileMode.ReadOnly);
  try {
    const header = handle.readBytes(100);
    const magic = 'SQLite format 3\0';
    if (header.length !== 100 ||
        ![...magic].every((char, i) => header[i] === char.charCodeAt(0))) {
      throw new Error(`Invalid SQLite header: ${file.name}`);
    }

    // The schema cookie rejects an uninitialized file. The daemon's startup
    // migration runner, not this header field, checks the migration version.
    const schemaCookie = new DataView(
      header.buffer, header.byteOffset, header.byteLength,
    )
      .getUint32(40);
    if (schemaCookie === 0) {
      throw new Error(`No persisted schema: ${file.name}`);
    }
  } finally {
    handle.close();
  }
}

/** Exercise the public SDK and real gomobile runtime inside the app sandbox. */
async function runStorageSmoke(): Promise<string> {
  const dataDir = await getDefaultDataDir();
  const databases = ['waved.db', 'swaps.db'].map(
    (name) => new File(`file://${dataDir}/data/regtest/${name}`),
  );
  const reopening = databases.some((file) => file.exists);
  if (reopening) databases.forEach(assertDatabase);

  const client = createNativeClient();
  try {
    // No wallet is created, so no chain sync or live backend is needed.
    // Startup still opens both stores and applies all SQL migrations.
    await client.start({
      dataDir,
      network: 'regtest',
      walletType: 'lwwallet',
      arkServerAddress: '127.0.0.1:1',
      arkServerInsecure: true,
      walletEsploraUrl: 'http://127.0.0.1:1',
      swapServerAddress: '127.0.0.1:1',
      swapServerInsecure: true,
      debugLevel: 'error',
    });
    const info = await client.getInfo();
    if (info.network !== 'regtest' || info.walletState !== 'none') {
      throw new Error(`Unexpected runtime state: ${JSON.stringify(info)}`);
    }
  } finally {
    await client.stop();
  }

  databases.forEach(assertDatabase);
  return `Native storage smoke passed: ${reopening ? 'reopened' : 'fresh'}`;
}

// Share the run across React effect re-mounts; the Go runtime is a singleton.
let result: Promise<string> | undefined;

/** Minimal test screen whose success can only come from the native runtime. */
export default function StorageSmokeApp() {
  const [status, setStatus] = useState('Native storage smoke running');

  useEffect(() => {
    let active = true;
    result ??= runStorageSmoke();
    void result.then(
      (message) => { if (active) setStatus(message); },
      (error: unknown) => {
        if (active) setStatus(`Native storage smoke failed: ${String(error)}`);
      },
    );
    return () => { active = false; };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text accessibilityRole="text" selectable>{status}</Text>
    </View>
  );
}
