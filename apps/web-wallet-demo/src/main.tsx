import React from "react";
import { createRoot } from "react-dom/client";
import { WalletDKProvider } from "@lightninglabs/walletdk-react";
import {
  createWebWalletEngine,
  RUNTIME_MANIFEST_VERSION,
  webPasskeyCeremony,
} from "@lightninglabs/walletdk-web";
import { App } from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { consumePendingWipe } from "./lib/wipeLocalData";
import { requestPersistentStorage } from "./lib/persistStorage";
// Self-host IBM Plex (the weights used by index.css) so the fonts load
// same-origin; cross-origin Google Fonts are blocked under COEP require-corp.
// Import the latin subset only; the UI is English, so the cyrillic, greek,
// vietnamese, and latin-ext subsets would just be dead weight in the bundle.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./index.css";

// boot clears any pending wipe before mounting, so a reset starts the app from
// clean storage with no OPFS handles held open. The engine is constructed
// after the wipe completes, and not before, because the Worker it creates
// must not exist while a pending wipe clears OPFS.
async function boot() {
  // Warm the memoized passkey support probe now, before onboarding ever
  // mounts, so its result is already resolved by the time a screen reads it.
  void webPasskeyCeremony.supportsPasskeyPrf();

  await consumePendingWipe();

  // Ask the browser to keep the OPFS-backed wallet data out of routine
  // eviction. Best-effort and non-blocking, so it never gates the first paint.
  void requestPersistentStorage();

  // The runtime defaults to a Web Worker, keeping the UI thread free. The demo
  // self-hosts the daemon binaries next to the app bundle under
  // runtime/<RUNTIME_MANIFEST_VERSION>/ (staged there by wasm:local and
  // wasm:fetch), so every asset set gets a unique URL and a browser can never
  // reuse a stale cached runtime after a version bump. The path is resolved
  // against Vite's base URL (./ locally, /demo/ in production).
  // debug logs every RPC request/response to the console for local diagnosis.
  // The engine is built once here and injected into the provider, which is
  // transport-agnostic.
  const engine = createWebWalletEngine({
    runtimeBaseUrl: new URL(
      `runtime/${RUNTIME_MANIFEST_VERSION}/`,
      new URL(import.meta.env.BASE_URL, window.location.href),
    ).href,
    debug: true,
  });

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <WalletDKProvider engine={engine}>
          <App />
        </WalletDKProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void boot();
