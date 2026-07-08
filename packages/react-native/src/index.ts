import { NativeEventEmitter, NativeModules } from 'react-native';
import {
  createWalletEngine,
  type WalletDKClient,
  type PasskeyCeremony,
  type DistributiveOmit,
  type WalletEngine,
  type WalletEngineOptions,
} from '@lightninglabs/walletdk-core';
import NativeWalletdk from './NativeWalletdk';
import { NativeWalletDKClient } from './client';
import {
  nativePasskeyCeremony,
  type NativePasskeyCeremonyOptions,
} from './passkey';

/**
 * Creates a {@link WalletDKClient} backed by the React Native transport: the
 * daemon compiled into the app via the gomobile bindings. Takes no options
 * today; an options parameter can be added later without a breaking change.
 */
export function createNativeClient(): WalletDKClient {
  // NativeModules.Walletdk is the interop view of the Turbo Module; the
  // emitter needs it (or any module carrying addListener/removeListeners) to
  // route 'walletdkActivity' device events on both platforms.
  const emitter = new NativeEventEmitter(NativeModules.Walletdk);

  return new NativeWalletDKClient(NativeWalletdk, (listener) => {
    const subscription = emitter.addListener('walletdkActivity', listener);

    return () => subscription.remove();
  });
}

/**
 * Options for {@link createNativeWalletEngine}. See {@link WalletEngineOptions}
 * for the config/autoStart field docs; the type requires config when
 * autoStart is true.
 */
export type NativeWalletEngineOptions = DistributiveOmit<
  WalletEngineOptions,
  'client'
>;

/**
 * Creates a {@link WalletEngine} over the React Native transport: the
 * one-call setup for an RN app. Pass the engine to WalletDKProvider from
 * \@lightninglabs/walletdk-react.
 */
export function createNativeWalletEngine(
  options: NativeWalletEngineOptions = {},
): WalletEngine {
  return createWalletEngine({
    client: createNativeClient(),
    ...options,
  });
}

/**
 * Creates the native (Android Credential Manager / iOS AuthenticationServices)
 * implementation of the {@link PasskeyCeremony} contract; pass it to
 * usePasskeyWallet, or drive it directly. Requires the relying-party domain
 * to be associated with your app (assetlinks.json on Android, an Associated
 * Domains entitlement plus apple-app-site-association on iOS). iOS support is
 * experimental and needs iOS 18 or newer at runtime.
 */
export function createNativePasskeyCeremony(
  options: NativePasskeyCeremonyOptions,
): PasskeyCeremony {
  return nativePasskeyCeremony(NativeWalletdk, options);
}

/**
 * Resolves the platform default wallet data directory (the same directory
 * {@link createNativeClient}'s client uses when RuntimeConfig.dataDir is not
 * set). Exposed for app-level data management: showing the storage location,
 * backing it up, or deleting it to wipe the wallet.
 *
 * Returns a plain absolute filesystem path with no URI scheme; a consumer that
 * needs a `file://` URL (for example to delete the directory) must add it. The
 * directory is not guaranteed to exist until the runtime has started.
 */
export function getDefaultDataDir(): Promise<string> {
  return NativeWalletdk.getDefaultDataDir();
}

export type {
  NativePasskeyCeremonyOptions,
  WalletdkPasskeyNativeModule,
} from './passkey';

export { NativeWalletDKClient } from './client';
export type {
  NativeActivityEvent,
  SubscribeToNativeEvents,
  WalletdkNativeModule,
} from './client';

// Re-export the core contract so an RN consumer can import the client and
// every type/enum from this one package, the way walletdk-web already does.
export * from '@lightninglabs/walletdk-core';
