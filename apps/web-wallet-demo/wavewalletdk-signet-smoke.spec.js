const { expect, test } = require("@playwright/test");

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

  // No ?regtest=1, so a fresh registry lands on the create-wallet screen with
  // only the hosted network presets available.
  await page.goto("/");
  const walletName = page.getByLabel("Wallet name");
  await expect(walletName).toBeVisible({ timeout: 30000 });

  // Regtest requires the query param to unlock, and its "Advanced endpoints"
  // section is regtest-only, so neither renders here. Signet and testnet use
  // their SDK presets with nothing to edit, which is why the whole endpoints
  // section is gone for them.
  await expect(
    page.getByRole("button", { name: "regtest", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Advanced endpoints" }),
  ).toHaveCount(0);

  await walletName.fill(`Signet Smoke ${Date.now()}`);
  // Signet is the first network in the list and selected by default, so no
  // extra click is needed to keep it selected.
  await page.getByRole("button", { name: "Continue" }).click();

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
