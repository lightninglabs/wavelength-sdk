import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  WalletDKClient,
  PasskeyCeremony,
} from '@lightninglabs/walletdk-core';
import NativeWalletdk from './NativeWalletdk';
import { NativeWalletDKClient } from './client';
import {
  nativePasskeyCeremony,
  type NativePasskeyCeremonyOptions,
} from './passkey';

/**
 * Creates a {@link WalletDKClient} backed by the React Native transport: the
 * daemon compiled into the app via the gomobile bindings. Takes no options in
 * this release; the signature reserves an options object for future use.
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
