import React from "react";
import { createRoot } from "react-dom/client";
import { WalletDKProvider } from "@lightninglabs/walletdk-react";
import { createWebClient } from "@lightninglabs/walletdk-web";
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
// clean storage with no OPFS handles held open.
async function boot() {
  await consumePendingWipe();

  // Ask the browser to keep the OPFS-backed wallet data out of routine
  // eviction. Best-effort and non-blocking, so it never gates the first paint.
  void requestPersistentStorage();

  // The runtime defaults to a Web Worker, keeping the UI thread free. The demo
  // self-hosts the daemon binaries at the app origin root and points
  // runtimeBaseUrl there. It could be omitted - worker mode defaults to the
  // document base URL - but is explicit here to mirror a hosted-assets
  // deployment. debug logs every RPC request/response to the console for local
  // diagnosis. The client is built here and injected into the provider, which is
  // transport-agnostic.
  const client = createWebClient({
    runtimeBaseUrl: `${window.location.origin}/`,
    debug: true,
  });

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <WalletDKProvider client={client}>
          <App />
        </WalletDKProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

void boot();
