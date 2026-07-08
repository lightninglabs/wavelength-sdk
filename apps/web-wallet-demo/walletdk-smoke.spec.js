const { expect, test } = require("@playwright/test");

// createReadyWallet walks a cold page to a ready wallet: configure the runtime,
// start it, create a wallet, and acknowledge the recovery phrase.
async function createReadyWallet(
  page,
  { baseURL, dataDir, swapDatabaseFileName, password },
  testInfo,
) {
  await page.goto("/");
  // The "Start runtime" button is the connect screen, which only renders once
  // the WASM runtime has loaded (phase runtimeReady).
  const startRuntime = page.getByRole("button", { name: "Start runtime" });
  await expect(startRuntime).toBeVisible({ timeout: 30000 });

  await configureRuntime(page, baseURL, dataDir, swapDatabaseFileName);
  await startRuntime.click();

  const createWallet = page.getByRole("button", { name: "Create wallet" });
  await expect(createWallet).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await createWallet.click();

  await expect(page.getByRole("heading", { name: "Recovery phrase" })).toBeVisible(
    { timeout: 60000 },
  );

  if (testInfo) {
    await testInfo.attach("create-wallet", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }

  await page.getByRole("button", { name: "I saved it" }).click();
}

test("wallet create and address state persist with OPFS SQLite", async ({
  page,
}, testInfo) => {
  const password = "test-password";
  const baseURL = testInfo.project.use.baseURL;
  const dataDir = `/walletdk-smoke-${Date.now()}`;
  const swapDatabaseFileName = `/walletdk-swaps-${Date.now()}.db`;

  const consoleMessages = [];
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleMessages.push(line);
    if (process.env.WALLETDK_SMOKE_VERBOSE) {
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleMessages.push(line);
    if (process.env.WALLETDK_SMOKE_VERBOSE) {
      console.log(line);
    }
  });

  await createReadyWallet(
    page,
    { baseURL, dataDir, swapDatabaseFileName, password },
    testInfo,
  );

  const startRuntime = page.getByRole("button", { name: "Start runtime" });

  // The account chip carries the full identity pubkey and only renders inside
  // the authenticated app shell, so its presence confirms we reached the
  // dashboard.
  const accountChip = page.getByTestId("account-pubkey");
  await expect(accountChip).toBeVisible({ timeout: 60000 });
  const identity = await accountChip.getAttribute("data-pubkey");
  expect(identity.length).toBeGreaterThan(10);

  // Fresh wallets are empty, so home shows the board-on-chain CTA.
  // Clicking it fetches and displays the boarding address inline on HomeScreen
  // (no navigation to ReceiveScreen; the address appears in place).
  await page.getByRole("button", { name: "Get a boarding address" }).click();
  await expect(page.getByText(/bcrt1/)).toBeVisible({ timeout: 30000 });

  // Navigate to ReceiveScreen to exercise the Lightning invoice flow.
  // The screen defaults to the Lightning tab.
  await page.getByRole("button", { name: "Receive" }).click();
  await page.getByLabel("Amount (sats)").fill("1000");
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByText(/lnbcrt/)).toBeVisible({ timeout: 60000 });

  // List(ACTIVITY) reads from the daemon's canonical activity store, which
  // surfaces a receive only once its swap settles; an unpaid invoice is not
  // yet in the feed (the same way a freshly issued boarding address is not a
  // deposit row until it confirms). Simulating swap settlement is out of scope
  // for the hermetic mock, so a just-created invoice shows the empty state.
  // The OPFS-persistence assertions after the reload are the gold standard.
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("No activity yet.")).toBeVisible({
    timeout: 30000,
  });

  await testInfo.attach("dashboard", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  // Reload and reopen the same data directory. Surviving the reload IS the
  // OPFS-persistence assertion: a non-persistent (in-memory) VFS would lose the
  // wallet, so the post-reload screen would offer "Create wallet" instead of
  // "Unlock" and the expectations below would fail.
  await page.reload();
  await expect(startRuntime).toBeVisible({ timeout: 30000 });

  await configureRuntime(page, baseURL, dataDir, swapDatabaseFileName);
  await startRuntime.click();

  const unlock = page.getByRole("button", { name: "Unlock", exact: true });
  await expect(unlock).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Password", { exact: true }).fill(password);
  await unlock.click();

  await expect(accountChip).toBeVisible({ timeout: 60000 });
  const reloadedIdentity = await accountChip.getAttribute("data-pubkey");
  expect(reloadedIdentity).toBe(identity);

  await testInfo.attach("unlock-dashboard", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach("console", {
    body: consoleMessages.join("\n"),
    contentType: "text/plain",
  });
});

// An invoice with an amount in its HRP, an amountless invoice, and an address.
// The screen must ask for an amount only for the address; the amountless
// invoice is unsendable in v1, so it gets a notice instead.
const invoiceWithAmount = "lnbcrt500u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwx";
const amountlessInvoice = "lnbcrt1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvle";
const onchainAddress = "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";

test("send screen shows only the fields the destination needs", async ({
  page,
}, testInfo) => {
  const password = "test-password";
  const baseURL = testInfo.project.use.baseURL;
  const dataDir = `/walletdk-smoke-send-${Date.now()}`;
  const swapDatabaseFileName = `/walletdk-swaps-send-${Date.now()}.db`;

  await createReadyWallet(page, { baseURL, dataDir, swapDatabaseFileName, password });

  const accountChip = page.getByTestId("account-pubkey");
  await expect(accountChip).toBeVisible({ timeout: 60000 });

  // `exact` matters: the nav button's accessible name "Send" is a substring of
  // the "Send max" toggle's, and Playwright matches names by substring.
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const dest = page.getByLabel("Invoice or address");
  const amount = page.getByLabel("Amount (sats)");
  const sendMax = page.getByRole("button", { name: "Send max" });
  const cont = page.getByRole("button", { name: "Continue" });

  // Empty: nothing conditional, Continue dead.
  await expect(amount).toBeHidden();
  await expect(sendMax).toBeHidden();
  await expect(cont).toBeDisabled();

  // Invoice carrying an amount: no Amount field, Continue live, hint shown.
  await dest.fill(invoiceWithAmount);
  await expect(page.getByText("Amount is set by the invoice")).toBeVisible();
  await expect(amount).toBeHidden();
  await expect(sendMax).toBeHidden();
  await expect(cont).toBeEnabled();

  // Amountless invoice: v1 cannot send it (the daemon ignores amountSat on
  // the invoice path and rejects an amountless invoice outright), so the
  // Amount field stays hidden, the unsupported notice shows, and Continue
  // stays dead.
  await dest.fill(amountlessInvoice);
  await expect(amount).toBeHidden();
  await expect(
    page.getByText("This invoice carries no amount. Amountless invoices are not supported yet."),
  ).toBeVisible();
  await expect(cont).toBeDisabled();

  // Address: Send max appears; toggling it disables the Amount field.
  await dest.fill(onchainAddress);
  await expect(sendMax).toBeVisible();
  await expect(amount).toBeEnabled();
  await sendMax.click();
  await expect(amount).toBeDisabled();

  // A prepareSend failure keeps the user on the form. The hermetic mock has no
  // out-swap route and the wallet holds no VTXOs, so Continue must surface an
  // error rather than advance to the review step. Asserting the alert (not just
  // the absence of the review step) is what distinguishes a rejection from a
  // hang: an absent review step proves nothing on its own, because it is absent
  // before the request settles too.
  await sendMax.click();
  await amount.fill("1000");
  await cont.click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Review")).toBeHidden();
  await expect(dest).toBeVisible();
});

async function configureRuntime(page, baseURL, dataDir, swapDatabaseFileName) {
  await page.getByRole("button", { name: "regtest", exact: true }).click();
  // Every endpoint field, including Ark gateway URL and Wallet Esplora URL,
  // lives inside the Advanced section, so expand it before filling any of them.
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  // Mailbox traffic shares the Ark and swap server edges, so RuntimeConfig no
  // longer exposes separate mailbox gateway fields.
  await page.getByLabel("Ark gateway URL").fill(baseURL);
  await page.getByLabel("Wallet Esplora URL").fill(baseURL);
  await page.getByLabel("Swap server gateway URL").fill(baseURL);
  await page.getByLabel("Data directory").fill(dataDir);
  await page.getByLabel("Swap database file").fill(swapDatabaseFileName);
}
