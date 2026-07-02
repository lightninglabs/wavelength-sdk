// The React Native transport package. The client, native module spec, and
// factory land in later tasks; this placeholder keeps the package building
// from its first commit.

// Re-export the core contract so an RN consumer can import the client and
// every type/enum from this one package, the way walletdk-web already does.
export * from '@lightninglabs/walletdk-core';

// Temporary spike escape hatch: exposes the raw native module so the demo can
// drive start/getInfo before the typed client exists. Removed when the
// NativeWalletDKClient lands.
export { default as nativeWalletdkModule } from './NativeWalletdk';
