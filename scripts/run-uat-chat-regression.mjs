import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const base = process.env.UAT_CHAT_OUTPUT || "outputs/uat-chat-retest-2026-10-16";
assert.match(base, /^outputs\/[a-zA-Z0-9._-]+$/);
assert.ok(!existsSync(`${base}/results.json`), "Use a fresh output directory to preserve earlier evidence");
mkdirSync(base, {recursive: true});
const unitFiles = [
  "tests/unit/customer-inquiry.test.ts", "tests/unit/dashboard-analysis.test.ts",
  "tests/unit/dashboard-analysis-actions.test.ts", "tests/unit/dashboard-analysis-schema.test.ts",
  "tests/unit/sales-order-form-pricing.test.tsx", "tests/unit/sales-order-form-idempotency.test.tsx",
  "tests/unit/table-search-toolbar.test.ts", "tests/unit/payment-date-default.test.tsx",
  "tests/unit/business-clock.test.ts", "tests/unit/po-date-input.test.ts", "tests/unit/action-notes.test.ts",
  "tests/integration/sales-order-approval-actions.test.ts", "tests/integration/combined-delivery-actions.test.ts",
  "tests/integration/warehouse-page.test.tsx", "tests/unit/delivery-note-status.test.ts"
];
const jobs = [
  {name: "unit", args: [require.resolve("vitest/vitest.mjs"), "run", "--environment", "node", ...unitFiles,
    "--exclude", "tmp/**", "--exclude", "outputs/**", "--reporter=json", `--outputFile=${base}/unit-results.json`]},
  ...["inquiry-price-conversion", "combined-delivery-database"].map(name => ({name,
    args: ["scripts/run-uat-flow-a.mjs", "--integration-only", `--focus=${name}`]})),
  ...[
    ["sales-manager", "playwright.uat-sales-manager.config.ts"],
    ["batch-one", "playwright.uat-batch-one.config.ts"],
    ["batch-two", "playwright.uat-batch-two.config.ts"],
    ["admin", "playwright.uat-admin.config.ts"],
    ["flow-a", "playwright.uat-flow-a.config.ts"],
    ["flow-ab", "playwright.uat-flow-ab.config.ts"],
    ["flow-bc", "playwright.uat-flow-bc.config.ts"],
    ["flow-cde", "playwright.uat-flow-cde.config.ts"]
  ].map(([name, config]) => ({name, config, args: ["scripts/run-uat-flow-a.mjs", "--browser-only"]}))
];
const results = {started: new Date().toISOString(), scope: "All fixes in this chat; isolated sequential database/browser runs", jobs: []};
const save = () => writeFileSync(`${base}/results.json`, JSON.stringify(results, null, 2));
for (const job of jobs) {
  const directory = `${base}-${job.name}`;
  assert.ok(!existsSync(directory), `Output already exists: ${directory}`);
  const entry = {name: job.name, started: new Date().toISOString(), output: job.name === "unit" ? base : directory, status: "running"};
  results.jobs.push(entry); save(); console.log(`START ${job.name}`);
  let log = "";
  entry.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, job.args, {windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, SIT_UMKM_OUTPUT_DIR: directory, SIT_UMKM_DATE: "2026-10-16",
      SIT_UMKM_BROWSER_CONFIG: job.config || "playwright.uat-flow-a.config.ts"
    }});
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      log += chunk.toString(); writeFileSync(`${base}/${job.name}.log`, log);
    });
    child.on("error", reject); child.on("exit", resolve);
  });
  entry.status = entry.exitCode === 0 ? "passed" : "failed"; entry.completed = new Date().toISOString();
  if (job.name !== "unit") {
    const summaryPath = job.config ? `${directory}/run-browser-summary.json` : `${directory}/run-${job.name}-integration-summary.json`;
    if (existsSync(summaryPath)) entry.integrity = JSON.parse(readFileSync(summaryPath, "utf8"));
    if (!entry.integrity?.publicUnchanged || !entry.integrity?.schemaRemoved ||
      (job.config && !entry.integrity?.storageRemoved)) {
      entry.status = "integrity-check-failed"; save(); throw new Error(`Review isolation/cleanup before continuing: ${job.name}`);
    }
  }
  save(); console.log(`END ${job.name}: ${entry.status} (exit ${entry.exitCode})`);
}
results.completed = new Date().toISOString(); save();
if (results.jobs.some(job => job.status !== "passed")) process.exitCode = 1;
