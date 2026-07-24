const fs = require("fs");
const path = require("path");
const { expect, test } = require("@playwright/test");

const runs = Number(process.env.WAVELENGTH_PERF_RUNS || 5);
const reportPath = process.env.WAVELENGTH_PERF_REPORT ||
  path.join(__dirname, "test-results", "wavelength-perf.json");
const budgetPath = process.env.WAVELENGTH_PERF_BUDGET ||
  path.join(__dirname, "perf-budget.json");

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);

  return sorted[index];
}

function metricKey(sample) {
  const operation = sample.phase === "adoptInfo"
    ? `.${sample.detail?.operation || "unknown"}`
    : "";

  return `${sample.segment}.${sample.stage}.${sample.phase}${operation}`;
}

function summarize(samples) {
  const grouped = new Map();
  for (const sample of samples) {
    // A sample tagged as failed timed work the runtime then abandoned, so it
    // belongs in the report but not in a latency distribution a budget guards.
    // The raw samples array still carries it for anyone reading the report.
    if (sample.detail?.outcome === "error") {
      continue;
    }
    const key = metricKey(sample);
    const values = grouped.get(key) || [];
    values.push(sample.durationMs);
    grouped.set(key, values);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [
        key,
        {
          samples: values.length,
          p50Ms: percentile(values, 0.5),
          p95Ms: percentile(values, 0.95),
          minMs: Math.min(...values),
          maxMs: Math.max(...values),
        },
      ]),
  );
}

function checkBudget(summary, samples, budget) {
  const violations = [];
  for (const [key, limits] of Object.entries(budget.metrics)) {
    const metric = summary[key];
    if (!metric) {
      violations.push(`${key}: no samples`);
      continue;
    }
    if (metric.p95Ms > limits.p95Ms) {
      violations.push(
        `${key}: p95 ${metric.p95Ms.toFixed(1)}ms exceeds ` +
          `${limits.p95Ms.toFixed(1)}ms`,
      );
    }
  }

  for (const sample of samples) {
    if (
      sample.phase === "adoptInfo" &&
      Number(sample.detail?.attempts || 0) > budget.maxAdoptInfoAttempts
    ) {
      violations.push(
        `${sample.segment}.wallet.adoptInfo.${sample.detail?.operation}: ` +
          `${sample.detail.attempts} attempts exceeds ` +
          `${budget.maxAdoptInfoAttempts}`,
      );
    }
  }

  return violations;
}

// fillCreateForm fills the first-run create-wallet screen: name, regtest, and
// the mock server's endpoints. Mirrors the smoke test's helper; the page must
// be opened with ?regtest=1 for the regtest option to be offered. Storage
// isolation comes from the per-run browser context, so there is no data
// directory to set.
async function fillCreateForm(page, baseURL, name) {
  await page.getByLabel("Wallet name").fill(name);
  await page.getByRole("button", { name: "regtest", exact: true }).click();
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  await page.getByLabel("Ark server address").fill(baseURL);
  await page.getByLabel("Wallet Esplora URL").fill(baseURL);
  await page.getByLabel("Swap server address").fill(baseURL);
}

test("wallet startup, create, and unlock stay within the performance budget", async ({
  browser,
}, testInfo) => {
  test.skip(
    !Number.isSafeInteger(runs) || runs < 1,
    "WAVELENGTH_PERF_RUNS must be a positive integer",
  );

  const samples = [];
  const baseURL = testInfo.project.use.baseURL;

  // Run 0 is a warm-up whose samples are discarded. The first iteration reads
  // the ~130 MB runtime off cold OS page cache and lands two to three times
  // slower than every run after it, which is disk warmth rather than anything
  // the SDK does. Keeping it would put that one sample in the budgeted
  // distribution, and since percentile() is nearest-rank, p95 is the maximum
  // for any sample count up to 20: one cold read would decide the gate.
  for (let run = 0; run <= runs; run++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let segment = "coldLoad";
    await page.exposeFunction("__wavelengthReportPerformance", (event) => {
      samples.push({ run, segment, ...event });
    });
    const wallClockSample = (phase, startedAt) => {
      samples.push({
        run,
        segment,
        stage: "browser",
        phase,
        durationMs: performance.now() - startedAt,
      });
    };

    const walletName = `perf-${Date.now()}-${run}`;
    const password = "performance-test-password";
    const cont = page.getByRole("button", { name: "Continue" });
    const accountChip = page.getByTestId("account-pubkey");

    const coldLoadStartedAt = performance.now();
    await page.goto("/?regtest=1");
    await expect(cont).toBeVisible({ timeout: 60000 });
    wallClockSample("pageReady", coldLoadStartedAt);
    await fillCreateForm(page, baseURL, walletName);
    await cont.click();

    const createWallet = page.getByRole("button", { name: "Create wallet" });
    await expect(createWallet).toBeVisible({ timeout: 60000 });
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    segment = "create";
    const createStartedAt = performance.now();
    await createWallet.click();
    await expect(
      page.getByRole("heading", { name: "Recovery phrase" }),
    ).toBeVisible({ timeout: 60000 });
    wallClockSample("createUsable", createStartedAt);
    await page.getByRole("button", { name: "I saved it" }).click();
    await expect(accountChip).toBeVisible({ timeout: 60000 });

    segment = "reload";
    const reloadStartedAt = performance.now();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your wallets" }),
    ).toBeVisible({ timeout: 60000 });
    wallClockSample("pageReady", reloadStartedAt);
    await page.getByRole("button", { name: walletName }).click();

    const unlock = page.getByRole("button", { name: "Unlock", exact: true });
    await expect(unlock).toBeVisible({ timeout: 60000 });
    await page.getByLabel("Password", { exact: true }).fill(password);
    segment = "unlock";
    const unlockStartedAt = performance.now();
    await unlock.click();
    await expect(accountChip).toBeVisible({ timeout: 60000 });
    wallClockSample("unlockUsable", unlockStartedAt);

    await context.close();
  }

  const measured = samples.filter((sample) => sample.run > 0);
  const summary = summarize(measured);
  const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
  const violations = checkBudget(summary, measured, budget);
  const report = {
    generatedAt: new Date().toISOString(),
    browser: testInfo.project.name,
    browserVersion: browser.version(),
    runs,
    budgetPath: path.relative(__dirname, budgetPath),
    summary,
    // Every sample, warm-up included (run 0), so a pathological first load is
    // still visible to anyone reading the report even though it is not judged.
    samples,
    violations,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await testInfo.attach("performance-report", {
    path: reportPath,
    contentType: "application/json",
  });

  console.log(JSON.stringify({ runs, summary, violations }, null, 2));
  expect(violations, violations.join("\n")).toEqual([]);
});
