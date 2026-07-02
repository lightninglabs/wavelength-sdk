import { useState } from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { nativeWalletdkModule } from '@lightninglabs/walletdk-react-native';

// The Android emulator reaches the host machine as 10.0.2.2; the iOS
// simulator shares the host loopback.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

/**
 * Temporary spike screen: boots the embedded daemon against the local regtest
 * stack and fetches wallet info, proving the gomobile bridge end to end. The
 * real demo UI replaces this once the typed client lands.
 */
export default function App() {
  const [output, setOutput] = useState('Tap start to boot the daemon.');

  const run = async (label: string, fn: () => Promise<string>) => {
    try {
      const result = await fn();
      setOutput(`${label} ok:\n${result || '(empty)'}`);
    } catch (err) {
      setOutput(`${label} failed:\n${String(err)}`);
    }
  };

  const start = () =>
    run('start', async () => {
      const dataDir = await nativeWalletdkModule.getDefaultDataDir();
      const config = {
        network: 'regtest',
        data_dir: dataDir,
        wallet_type: 'lwwallet',
        wallet_esplora_url: `http://${HOST}:8501`,
        server_address: `${HOST}:7070`,
        server_transport: 'grpc',
        server_insecure: true,
      };
      return nativeWalletdkModule.call('start', JSON.stringify(config));
    });

  const getInfo = () =>
    run('getInfo', () => nativeWalletdkModule.call('getInfo', '{}'));

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>walletdk spike</Text>
      <Button title="start (regtest)" onPress={start} />
      <Button title="getInfo" onPress={getInfo} />
      <ScrollView style={styles.output}>
        <Text style={styles.mono}>{output}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  output: { flex: 1, marginTop: 12 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
});
