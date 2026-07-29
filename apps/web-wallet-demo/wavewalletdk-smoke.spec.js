const { expect, test } = require("@playwright/test");

// fillCreateForm fills the create-wallet screen: name, regtest network, and
// the mock server's endpoints in the advanced section. Requires the page to
// have been opened with ?regtest=1 so the regtest option is visible.
async function fillCreateForm(page, baseURL, name) {
  await page.getByLabel("Wallet name").fill(name);
  await page.getByRole("button", { name: "regtest", exact: true }).click();
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  await page.getByLabel("Ark server address").fill(baseURL);
  await page.getByLabel("Wallet Esplora URL").fill(baseURL);
  await page.getByLabel("Swap server address").fill(baseURL);
}

// createReadyWallet walks a cold page to a ready wallet: land on the
// first-run create-wallet screen, submit it into onboarding, create the
// wallet, and acknowledge the recovery phrase. Each test gets its own
// Playwright browser context, so storage isolation across wallets no longer
// needs a per-test data directory the way it did before wallets were
// registry entries.
async function createReadyWallet(page, { baseURL, name, password }, testInfo) {
  await page.goto("/?regtest=1");
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeVisible({ timeout: 30000 });
  await fillCreateForm(page, baseURL, name);
  await cont.click();

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
  const name = "Smoke Wallet";

  const consoleMessages = [];
  page.on("console", (message) => {
    const line = `[${message.type()}] ${message.text()}`;
    consoleMessages.push(line);
    if (process.env.WAVELENGTH_SMOKE_VERBOSE) {
      console.log(line);
    }
  });
  page.on("pageerror", (error) => {
    const line = `[pageerror] ${error.message}`;
    consoleMessages.push(line);
    if (process.env.WAVELENGTH_SMOKE_VERBOSE) {
      console.log(line);
    }
  });

  await createReadyWallet(page, { baseURL, name, password }, testInfo);

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
  // records a receive as a pending entry as soon as its invoice is created,
  // before the inbound payment settles. So the just-created 1,000-sat invoice
  // surfaces immediately as a pending "Received" row in the "waiting for
  // payment" phase; settlement (out of scope for the hermetic mock) would move
  // it to settled. The OPFS-persistence assertions after the reload are the
  // gold standard.
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Received").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("waiting for payment").first()).toBeVisible();

  await testInfo.attach("dashboard", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  // Emergency exit is reached from Settings, not the bottom bar. The wallet
  // holds no VTXOs yet, so the picker renders its empty state without any
  // additional daemon calls.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Emergency exit" }).click();
  await expect(page.getByText("Emergency exit")).toBeVisible();
  await expect(page.getByTestId("vtxo-picker")).toBeVisible();

  // Reload and reopen the same wallet from the returning-user list. Surviving
  // the reload IS the OPFS-persistence assertion: a non-persistent
  // (in-memory) VFS would lose the wallet, so the post-reload screen would
  // offer "Create a wallet" instead of "Your wallets" and the expectations
  // below would fail.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your wallets" })).toBeVisible(
    { timeout: 30000 },
  );
  await page.getByRole("button", { name }).click();

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

test("a second tab fails fast with a friendly locked message and can take over", async ({
  page,
  context,
}, testInfo) => {
  const password = "test-password";
  const baseURL = testInfo.project.use.baseURL;
  const name = "Smoke Wallet";

  await createReadyWallet(page, { baseURL, name, password });
  await expect(page.getByTestId("account-pubkey")).toBeVisible({ timeout: 60000 });

  // A second tab of the same origin must fail the start fast on the Web Locks
  // pre-check and show the actionable multi-tab copy, never the raw SQLite
  // trace the exclusive OPFS handles would otherwise produce. The wallet is
  // already registered, so the second tab lands on the returning-user list
  // and opens the same entry by name.
  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("heading", { name: "Your wallets" }),
  ).toBeVisible({ timeout: 30000 });
  await second.getByRole("button", { name }).click();

  await expect(
    second.getByRole("heading", { name: "Wallet open in another tab" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    second.getByText("This wallet is already running in another tab"),
  ).toBeVisible();
  // The wipe escape hatch is hidden for this expected condition.
  await expect(second.getByText("Clear all data")).toBeHidden();

  await testInfo.attach("second-tab-locked", {
    body: await second.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  // Closing the first tab releases the lock and, with it, the OPFS handles;
  // Try again in the second tab must then boot the same wallet and land on
  // the unlock screen (the daemon absorbs any handle-release lag by retrying
  // the open internally).
  await page.close();
  await second.getByRole("button", { name: "Try again" }).click();

  const unlock = second.getByRole("button", { name: "Unlock", exact: true });
  await expect(unlock).toBeVisible({ timeout: 60000 });
  await second.getByLabel("Password", { exact: true }).fill(password);
  await unlock.click();
  await expect(second.getByTestId("account-pubkey")).toBeVisible({
    timeout: 60000,
  });
});

test("stopping the runtime in one tab hands the wallet to another", async ({
  page,
  context,
}, testInfo) => {
  const password = "test-password";
  const baseURL = testInfo.project.use.baseURL;
  const name = "Smoke Wallet";

  await createReadyWallet(page, { baseURL, name, password });
  await expect(page.getByTestId("account-pubkey")).toBeVisible({ timeout: 60000 });

  const second = await context.newPage();
  await second.goto("/");
  await expect(
    second.getByRole("heading", { name: "Your wallets" }),
  ).toBeVisible({ timeout: 30000 });
  await second.getByRole("button", { name }).click();
  await expect(
    second.getByRole("heading", { name: "Wallet open in another tab" }),
  ).toBeVisible({ timeout: 30000 });

  // The locked copy tells the user they can stop the runtime in the other tab
  // instead of closing it. That path releases the lock through the daemon's
  // acknowledged stop (afterDaemonStopped), a different proof than the
  // browser reclaiming it on tab close, so it gets its own end-to-end leg.
  // Stop the runtime from the nav (the only "Stop runtime" control on the
  // home screen; the Settings screen adds a second, so stay off it here).
  await page.getByRole("button", { name: "Stop runtime" }).click();
  await expect(
    page.getByRole("heading", { name: "Runtime stopped" }),
  ).toBeVisible({ timeout: 60000 });

  await second.getByRole("button", { name: "Try again" }).click();
  const unlock = second.getByRole("button", { name: "Unlock", exact: true });
  await expect(unlock).toBeVisible({ timeout: 60000 });
});

test("a refused lock request shows a retry, not the wipe hatch", async ({
  page,
}, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const name = "Smoke Wallet";

  // Make the browser refuse the lock outright, which is a different condition
  // from another tab holding it: nothing is wrong with the wallet data, so the
  // screen must offer a plain retry and must not invite the user to wipe.
  await page.addInitScript(() => {
    navigator.locks.request = () =>
      Promise.reject(new DOMException("denied", "SecurityError"));
  });

  await page.goto("/?regtest=1");
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeVisible({ timeout: 30000 });
  await fillCreateForm(page, baseURL, name);
  await cont.click();

  await expect(
    page.getByRole("heading", { name: "Could not start just now" }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Clear all data")).toBeHidden();
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
  const name = "Smoke Wallet";

  await createReadyWallet(page, { baseURL, name, password });

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
