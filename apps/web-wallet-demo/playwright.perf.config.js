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
