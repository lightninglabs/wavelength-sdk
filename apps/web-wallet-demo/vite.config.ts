import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cross-origin isolation headers. SharedArrayBuffer (and therefore the OPFS
// SQLite VFS) is only available when the page is cross-origin isolated. Using
// real COOP/COEP response headers (require-corp, which every engine supports,
// unlike COEP credentialless) makes the dev and preview servers match the
// standalone Node servers (server.js, smoke-server.js) and production, so the
// app is isolated in all browsers including Safari without the
// enable-threads.js service-worker shim.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
});
