const { expect, test } = require("@playwright/test");

const arkServerURL = "https://signet.wavelength-rest.lightning.finance";
const swapServerURL = "https://signet.swapd-rest.lightning.finance";
const esploraURL = "https://mempool-signet.testnet.lightningcluster.com/api";

test("wavelength demo starts with live signet defaults", async ({
  page,
}, testInfo) => {
  const consoleMessages = [];
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleMessages.push(line);
    if (process.env.WAVELENGTH_SIGNET_SMOKE_VERBOSE) {
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleMessages.push(line);
    if (process.env.WAVELENGTH_SIGNET_SMOKE_VERBOSE) {
      console.log(line);
    }
  });

  await page.goto("/");
  // The connect screen (with its "Start runtime" button) renders only after the
  // WASM runtime has loaded.
  const startRuntime = page.getByRole("button", { name: "Start runtime" });
  await expect(startRuntime).toBeVisible({ timeout: 30000 });

  // Every endpoint field lives under "Advanced endpoints", so expand it before
  // asserting the seeded signet defaults (network defaults to signet). Mailbox
  // traffic shares the Ark and swap edges, so there are no separate mailbox
  // server fields.
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  await expect(page.getByLabel("Ark server address")).toHaveValue(arkServerURL);
  await expect(page.getByLabel("Wallet Esplora URL")).toHaveValue(esploraURL);
  await expect(page.getByLabel("Swap server address")).toHaveValue(
    swapServerURL,
  );

  await page.getByLabel("Data directory").fill(
    `/wavewalletdk-signet-smoke-${Date.now()}`,
  );
  await page.getByLabel("Swap database file").fill(
    `/wavewalletdk-signet-swaps-${Date.now()}.db`,
  );
  await startRuntime.click();

  // A fresh wallet on signet lands on the create screen once the runtime has
  // connected to the live servers.
  await expect(page.getByRole("button", { name: "Create wallet" })).toBeVisible({
    timeout: 120000,
  });

  await testInfo.attach("signet-start", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("console", {
    body: consoleMessages.join("\n"),
    contentType: "text/plain",
  });
});
