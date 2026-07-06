import { useMemo, useState } from 'react';
import {
  Button,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RuntimeConfig,
  WalletDKProvider,
  usePasskeyWallet,
  useWalletDK,
} from '@lightninglabs/walletdk-react';
import {
  createNativeClient,
  createNativePasskeyCeremony,
} from '@lightninglabs/walletdk-react-native';

// The Android emulator reaches the host machine as 10.0.2.2; the iOS
// simulator shares the host loopback.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

// Network presets for the native (gRPC) transport. The core presets carry the
// web transport's REST gateway URLs, so the demo defines its own: with gRPC,
// the server fields are host:port addresses, not URLs.
const PRESETS: Record<'regtest' | 'signet', RuntimeConfig> = {
  regtest: {
    network: 'regtest',
    arkServerUrl: `${HOST}:7070`,
    esploraUrl: `http://${HOST}:8501`,
    swapServerUrl: `${HOST}:10030`,
    serverInsecure: true,
    swapServerInsecure: true,
  },
  signet: {
    network: 'signet',
    arkServerUrl: 'arkd-signet.testnet.lightningcluster.com:443',
    esploraUrl: 'https://mempool.space/signet/api',
    swapServerUrl: 'swapd-signet.testnet.lightningcluster.com:443',
  },
};

// The demo's relying party: the docs site serves the association files that
// vouch for this app. Demo-grade trust; see the README.
const passkeyCeremony = createNativePasskeyCeremony({
  rpId: 'dadocs.lightning.engineering',
});

// The demo always uses the default data dir, so one fixed key is enough to
// remember which passkey credential opened the wallet (the web demo keys the
// same marker by data dir).
const PASSKEY_CREDENTIAL_KEY = 'walletdk.passkeyCredentialId';

export default function App() {
  return (
    <WalletDKProvider createClient={createNativeClient}>
      <View style={styles.container}>
        <WalletScreen />
      </View>
    </WalletDKProvider>
  );
}

/** Routes between the lifecycle screens based on the provider phase. */
function WalletScreen() {
  const { phase, error } = useWalletDK();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>WalletDK RN Demo</Text>
      <Text style={styles.phase}>phase: {phase}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {phase === 'runtimeReady' || phase === 'stopped' ? <StartSection /> : null}
      {phase === 'locked' || phase === 'needsWallet' ? <BootstrapSection /> : null}
      {phase === 'syncing' ? <Text>Wallet syncing...</Text> : null}
      {phase === 'ready' ? <WalletSection /> : null}
    </ScrollView>
  );
}

/** Picks a network preset and starts the embedded daemon. */
function StartSection() {
  const { start, operations } = useWalletDK();

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Start the wallet runtime</Text>
      <Button
        title="Start on regtest"
        disabled={operations.runtime.busy}
        onPress={() => start(PRESETS.regtest).catch(() => undefined)}
      />
      <Button
        title="Start on signet"
        disabled={operations.runtime.busy}
        onPress={() => start(PRESETS.signet).catch(() => undefined)}
      />
      <OperationError error={operations.runtime.error} />
    </View>
  );
}

/** Creates a new wallet or unlocks the existing one. */
function BootstrapSection() {
  const { createWallet, unlockWallet, info, operations } = useWalletDK();
  const passkey = usePasskeyWallet(passkeyCeremony);
  const [password, setPassword] = useState('');
  const hasWallet = info?.walletState === 'locked';

  const submit = () => {
    const action = hasWallet
      ? unlockWallet({ password })
      : createWallet({ password });
    action.catch(() => undefined);
  };

  // Scopes the unlock assertion to the stored credential when one is known;
  // a fresh install falls back to a discoverable assertion.
  const submitPasskey = async () => {
    const outcome = hasWallet
      ? await passkey.openPasskeyWallet(
          (await AsyncStorage.getItem(PASSKEY_CREDENTIAL_KEY)) ?? undefined,
        )
      : await passkey.createPasskeyWallet('WalletDK RN Demo');
    if (outcome) {
      await AsyncStorage.setItem(PASSKEY_CREDENTIAL_KEY, outcome.credentialId);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>
        {hasWallet ? 'Unlock wallet' : 'Create wallet'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button
        title={hasWallet ? 'Unlock' : 'Create'}
        disabled={!password || operations.createWallet.busy || operations.unlockWallet.busy}
        onPress={submit}
      />
      {passkey.supported ? (
        <Button
          title={hasWallet ? 'Unlock with passkey' : 'Create with passkey'}
          disabled={passkey.busy}
          onPress={() => submitPasskey().catch(() => undefined)}
        />
      ) : null}
      <OperationError
        error={
          operations.createWallet.error ||
          operations.unlockWallet.error ||
          passkey.error
        }
      />
    </View>
  );
}

/** The main wallet view: balance, deposit, receive, send, and activity. */
function WalletSection() {
  const { balance, stop } = useWalletDK();

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Balance</Text>
      <Text style={styles.balance}>
        {balance ? `${balance.confirmedSat} sats` : 'loading...'}
      </Text>
      <DepositCard />
      <ReceiveCard />
      <SendCard />
      <ActivityCard />
      <Button title="Stop runtime" onPress={() => stop().catch(() => undefined)} />
    </View>
  );
}

/** Requests and shows an on-chain deposit (boarding) address. */
function DepositCard() {
  const { deposit, operations } = useWalletDK();
  const [address, setAddress] = useState('');

  const request = () =>
    deposit()
      .then((result) => setAddress(result.address ?? ''))
      .catch(() => undefined);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Deposit</Text>
      <Button title="New deposit address" disabled={operations.deposit.busy} onPress={request} />
      {address ? <Text selectable style={styles.mono}>{address}</Text> : null}
      <OperationError error={operations.deposit.error} />
    </View>
  );
}

/** Creates a Lightning invoice for a requested amount. */
function ReceiveCard() {
  const { receive, operations } = useWalletDK();
  const [amount, setAmount] = useState('1000');
  const [invoice, setInvoice] = useState('');

  const request = () =>
    receive({ amountSat: Number(amount) })
      .then((result) => setInvoice(result.invoice ?? ''))
      .catch(() => undefined);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Receive (Lightning)</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <Button
        title="Create invoice"
        disabled={operations.receive.busy || !Number(amount)}
        onPress={request}
      />
      {invoice ? <Text selectable style={styles.mono}>{invoice}</Text> : null}
      <OperationError error={operations.receive.error} />
    </View>
  );
}

/** Pays a Lightning invoice. */
function SendCard() {
  const { send, operations } = useWalletDK();
  const [invoice, setInvoice] = useState('');
  const [result, setResult] = useState('');

  const pay = () =>
    send({ invoice: invoice.trim() })
      .then((sent) => setResult(`sent, payment hash ${sent.paymentHash ?? 'pending'}`))
      .catch(() => undefined);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Send (Lightning)</Text>
      <TextInput
        style={styles.input}
        placeholder="lnbcrt..."
        autoCapitalize="none"
        value={invoice}
        onChangeText={setInvoice}
      />
      <Button title="Pay invoice" disabled={operations.send.busy || !invoice} onPress={pay} />
      {result ? <Text style={styles.mono}>{result}</Text> : null}
      <OperationError error={operations.send.error} />
    </View>
  );
}

/** The most recent activity entries, refreshed by the provider's stream. */
function ActivityCard() {
  const { activity } = useWalletDK();
  const rows = useMemo(() => activity.slice(0, 20), [activity]);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Activity</Text>
      {rows.length === 0 ? <Text>No activity yet.</Text> : null}
      <FlatList
        data={rows}
        scrollEnabled={false}
        keyExtractor={(item, index) => `${item.id ?? index}`}
        renderItem={({ item }) => (
          <Text style={styles.mono}>
            {item.kind} {item.status} {item.amountSat ?? ''}
          </Text>
        )}
      />
    </View>
  );
}

/** Renders an operation's error message when there is one. */
function OperationError({ error }: { error: string }) {
  return error ? <Text style={styles.error}>{error}</Text> : null;
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  phase: { textAlign: 'center', color: '#666' },
  section: { gap: 8 },
  card: { gap: 6, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  heading: { fontSize: 16, fontWeight: '600' },
  balance: { fontSize: 28, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 },
  error: { color: '#c00' },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
  },
});
