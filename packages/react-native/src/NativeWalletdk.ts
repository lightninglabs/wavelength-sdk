import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The Turbo Module contract for the walletdk native bridge. The surface is a
 * deliberately thin JSON pipe: `call` dispatches every facade verb by name
 * with a JSON string in and a JSON string out, and the activity stream
 * arrives as 'walletdkActivity' device events carrying
 * `{ kind: 'entry' | 'end' | 'error', payload: string }`.
 */
export interface Spec extends TurboModule {
  /** Invokes a facade verb by name with a JSON payload, returning JSON. */
  call(method: string, paramsJson: string): Promise<string>;
  /** Opens the activity subscription; entries arrive as device events. */
  startActivity(reqJson: string): Promise<void>;
  /** Closes the activity subscription; a no-op when none is open. */
  stopActivity(): Promise<void>;
  /** Resolves the platform default wallet data directory. */
  getDefaultDataDir(): Promise<string>;
  /** Required by NativeEventEmitter; the native side keeps no listener state. */
  addListener(eventName: string): void;
  /** Required by NativeEventEmitter; the native side keeps no listener state. */
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Walletdk');
