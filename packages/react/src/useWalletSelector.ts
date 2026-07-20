import type { WalletSnapshot } from "@lightninglabs/wavelength-core";
import { useSyncExternalStore } from "react";
import { useWalletEngine } from "./provider.tsx";

// Subscribes a component to one slice of the engine snapshot. The engine
// keeps slices referentially stable, so useSyncExternalStore's Object.is
// check makes unrelated changes free. Selectors must return references
// stored in the snapshot, never freshly built objects; hooks needing several
// fields call this once per field. The third argument serves the same
// snapshot during server rendering.
export function useWalletSelector<T>(select: (snap: WalletSnapshot) => T): T {
  const engine = useWalletEngine();

  return useSyncExternalStore(
    engine.subscribe,
    () => select(engine.getSnapshot()),
    () => select(engine.getSnapshot()),
  );
}
