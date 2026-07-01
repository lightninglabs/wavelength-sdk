import { defineConfig } from '@playwright/test';

// Build the static site, serve it with `astro preview`, and smoke-test it.
// PORT is configurable so the suite can run on a free port (e.g. when a dev
// server already holds 4321); reuseExistingServer lets it attach to a preview
// that's already up rather than failing on a port collision.
const PORT = Number(process.env.PORT) || 4321;

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: `http://localhost:${PORT}` },
});
