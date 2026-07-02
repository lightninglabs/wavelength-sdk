import { NativeEventEmitter, NativeModules } from 'react-native';
import type { WalletDKClient } from '@lightninglabs/walletdk-core';
import NativeWalletdk from './NativeWalletdk';
import { NativeWalletDKClient } from './client';

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

export { NativeWalletDKClient } from './client';
export type {
  NativeActivityEvent,
  SubscribeToNativeEvents,
  WalletdkNativeModule,
} from './client';

// Re-export the core contract so an RN consumer can import the client and
// every type/enum from this one package, the way walletdk-web already does.
export * from '@lightninglabs/walletdk-core';
