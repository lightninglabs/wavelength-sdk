const { expect, test } = require("@playwright/test");

const arkGatewayURL = "https://arkd-signet-rest.staging.lightningcluster.com";
const swapGatewayURL = "https://swapd-signet-rest.staging.lightningcluster.com";
const esploraURL = "https://mempool-signet.testnet.lightningcluster.com/api";

test("walletdk demo starts with live signet defaults", async ({
  page,
}, testInfo) => {
  const consoleMessages = [];
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleMessages.push(line);
    if (process.env.WALLETDK_SIGNET_SMOKE_VERBOSE) {
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleMessages.push(line);
    if (process.env.WALLETDK_SIGNET_SMOKE_VERBOSE) {
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
  // gateway fields.
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  await expect(page.getByLabel("Ark gateway URL")).toHaveValue(arkGatewayURL);
  await expect(page.getByLabel("Wallet Esplora URL")).toHaveValue(esploraURL);
  await expect(page.getByLabel("Swap server gateway URL")).toHaveValue(
    swapGatewayURL,
  );

  await page.getByLabel("Data directory").fill(
    `/wavewalletdk-signet-smoke-${Date.now()}`,
  );
  await page.getByLabel("Swap database file").fill(
    `/wavewalletdk-signet-swaps-${Date.now()}.db`,
  );
  await startRuntime.click();

  // A fresh wallet on signet lands on the create screen once the runtime has
  // connected to the live gateways.
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
