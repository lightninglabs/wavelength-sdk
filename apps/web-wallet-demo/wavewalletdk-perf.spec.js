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

async function configureRuntime(
  page,
  baseURL,
  dataDir,
  swapDatabaseFileName,
) {
  await page.getByRole("button", { name: "regtest", exact: true }).click();
  await page.getByRole("button", { name: "Advanced endpoints" }).click();
  await page.getByLabel("Ark server address").fill(baseURL);
  await page.getByLabel("Wallet Esplora URL").fill(baseURL);
  await page.getByLabel("Swap server address").fill(baseURL);
  await page.getByLabel("Data directory").fill(dataDir);
  await page.getByLabel("Swap database file").fill(swapDatabaseFileName);
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

  for (let run = 1; run <= runs; run++) {
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

    const suffix = `${Date.now()}-${run}`;
    const dataDir = `/wavewalletdk-perf-${suffix}`;
    const swapDatabaseFileName = `/wavewalletdk-perf-swaps-${suffix}.db`;
    const password = "performance-test-password";
    const startRuntime = page.getByRole("button", { name: "Start runtime" });
    const accountChip = page.getByTestId("account-pubkey");

    const coldLoadStartedAt = performance.now();
    await page.goto("/");
    await expect(startRuntime).toBeVisible({ timeout: 60000 });
    wallClockSample("pageReady", coldLoadStartedAt);
    await configureRuntime(page, baseURL, dataDir, swapDatabaseFileName);
    await startRuntime.click();

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
    await expect(startRuntime).toBeVisible({ timeout: 60000 });
    wallClockSample("pageReady", reloadStartedAt);
    await configureRuntime(page, baseURL, dataDir, swapDatabaseFileName);
    await startRuntime.click();

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

  const summary = summarize(samples);
  const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
  const violations = checkBudget(summary, samples, budget);
  const report = {
    generatedAt: new Date().toISOString(),
    browser: testInfo.project.name,
    browserVersion: browser.version(),
    runs,
    budgetPath: path.relative(__dirname, budgetPath),
    summary,
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
