// Re-export the core contract so a React host can import every type and enum
// from this one package. The transport is NOT re-exported: import createWebClient
// from @lightninglabs/walletdk-web (or a native transport) and pass the client to
// WalletDKProvider. Keeping this binding transport-agnostic is what lets it run
// over web or, later, React Native.
export * from "@lightninglabs/walletdk-core";

// The provider, its context state type, operation types, and useWalletDK.
export * from "./provider";

// The granular hooks built on top of useWalletDK.
export * from "./hooks";

// The passkey hook and its outcome/return types.
export { usePasskeyWallet } from "./usePasskeyWallet";
export type { UsePasskeyWallet, PasskeyWalletOutcome } from "./usePasskeyWallet";
