// Re-export the core contract so a React host can import every type and enum
// from this one package. Transports are NOT re-exported: create an engine
// with createWebWalletEngine (wavelength-web) or createNativeWalletEngine
// (wavelength-react-native) and pass it to WavelengthProvider. Keeping this
// binding transport-agnostic is what lets it run over web or React Native.
export * from "@lightninglabs/wavelength-core";

// The provider and the engine escape hatch.
export { WavelengthProvider, useWalletEngine } from "./provider.tsx";

// The granular state and mutation hooks.
export * from "./hooks.ts";

// The passkey hook and its outcome type.
export { useWalletPasskey } from "./useWalletPasskey.ts";
export type { PasskeyWalletOutcome } from "./useWalletPasskey.ts";
