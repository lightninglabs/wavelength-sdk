const { defineConfig, devices } = require("@playwright/test");

const host = process.env.WAVELENGTH_SMOKE_HOST || "127.0.0.1";
const port = Number(process.env.WAVELENGTH_SMOKE_PORT || 8790);
const baseURL = `http://${host}:${port}`;

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: "wavewalletdk-perf.spec.js",
  timeout: 10 * 60 * 1000,
  reporter: "line",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        "--disable-features=UpgradeInsecureRequests",
        "--allow-insecure-localhost",
      ],
    },
  },
  webServer: {
    command: "node smoke-server.js",
    cwd: __dirname,
    env: {
      HOST: host,
      PORT: String(port),
      // Pinned, not merely unset: Playwright merges the ambient environment
      // into this one, so an inherited value would silently benchmark the
      // SDK-inflates configuration against thresholds recorded for the
      // transport-inflates one.
      WAVELENGTH_SMOKE_RAW_GZ: "",
    },
    reuseExistingServer: false,
    timeout: 30000,
    url: `${baseURL}/`,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
