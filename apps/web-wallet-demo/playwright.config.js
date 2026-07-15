const { defineConfig, devices } = require("@playwright/test");

const host = process.env.WAVELENGTH_SMOKE_HOST || "127.0.0.1";
// 8790 avoids the regtest network's host ports (7071/8501/8091/10032); a stray
// regtest service on the smoke port would otherwise be reused via
// reuseExistingServer and break the run.
const port = Number(process.env.WAVELENGTH_SMOKE_PORT || 8790);
const baseURL = `http://${host}:${port}`;

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: "wavewalletdk-smoke.spec.js",
  timeout: 120000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    // Prevent Chromium from upgrading plain-HTTP smoke-server connections to
    // HTTPS in headless mode (Chromium 130+ HTTPS-First / UpgradeInsecureRequests
    // behaviour can redirect http://127.0.0.1 to https:// even without HSTS).
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        "--disable-features=UpgradeInsecureRequests",
        "--allow-insecure-localhost",
      ],
    },
  },
  webServer: {
    command: `node smoke-server.js`,
    cwd: __dirname,
    env: {
      HOST: host,
      PORT: String(port),
      WAVELENGTH_SMOKE_VERBOSE: process.env.WAVELENGTH_SMOKE_VERBOSE || "",
    },
    reuseExistingServer: !process.env.CI,
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
