import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
config({ path: ".env.local", quiet: true }); config({ quiet: true });
const schema = `order_edit_ui_${Date.now().toString(16)}_${randomBytes(4).toString("hex")}`;
assert.match(schema, /^order_edit_ui_[a-f0-9_]+$/);
function scopedUrl(raw) { const url = new URL(raw); url.searchParams.set("schema", schema); return url.toString(); }
const env = { ...process.env, DATABASE_URL: scopedUrl(process.env.DATABASE_URL), DIRECT_URL: scopedUrl(process.env.DIRECT_URL || process.env.DATABASE_URL),
  AUTH_SECRET: randomBytes(32).toString("hex"), ORDER_EDIT_TEST_SCHEMA: schema, ORDER_EDIT_TEST_DIST_DIR: ".next-order-edit-ui" };
const root = new PrismaClient();
const isolated = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const backups = new Map(["next-env.d.ts", "tsconfig.json", "tsconfig.tsbuildinfo"].map(file => [file, readFileSync(file)]));
let created = false; let server;
mkdirSync("tmp", { recursive: true });
function run(path, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path, ...args], { env, stdio: "inherit", windowsHide: true });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Test command exited ${code}`)));
  });
}
function statements(sql) {
  const result = []; let current = ""; let quoted = false;
  for (let index = 0; index < sql.length; index++) {
    if (sql.slice(index, index + 2) === "$$") { quoted = !quoted; current += "$$"; index++; }
    else if (sql[index] === ";" && !quoted) { if (current.trim()) result.push(current.trim()); current = ""; }
    else current += sql[index];
  }
  return result;
}
async function businessFingerprint() {
  const rows = await root.$queryRaw`
    SELECT (SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text, '[]')) FROM public.sales_orders s) AS orders,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id)::text, '[]')) FROM public.invoices i) AS invoices,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id)::text, '[]')) FROM public.sales_order_items i) AS items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id)::text, '[]')) FROM public.picking_lists p) AS sheets,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id)::text, '[]')) FROM public.picking_list_items p) AS sheet_items,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id)::text, '[]')) FROM public.sales_order_item_revisions r) AS revisions
  `;
  return rows[0];
}
const before = await businessFingerprint();
try {
  console.log("Preparing isolated order-edit UI schema");
  await run(require.resolve("prisma/build/index.js"), ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--output", "tmp/order-edit-test-schema.sql"]);
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  const [state] = await isolated.$queryRaw`SELECT current_schema() AS schema`;
  assert.equal(state.schema, schema, "Raw SQL must target the isolated schema");
  const structureSql = readFileSync("tmp/order-edit-test-schema.sql", "utf8").replace('CREATE SCHEMA IF NOT EXISTS "public";', "");
  assert.ok(!/\bpublic\b|\$ddl\$|\$setup\$/i.test(structureSql), "Test structure must not reference public");
  const migration = readFileSync("prisma/migrations/20261005090000_order_item_edit_foundation/migration.sql", "utf8");
  const triggerSql = migration.slice(migration.indexOf("CREATE FUNCTION public.remember_order_pack_start"), migration.lastIndexOf("COMMIT;")).replaceAll("public.", `"${schema}".`);
  const setup = [...statements(structureSql), ...statements(triggerSql)];
  const tables = [...structureSql.matchAll(/CREATE TABLE "([a-z0-9_]+)"/g)].map(match => match[1]);
  assert.ok(tables.length > 0);
  for (const tablename of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    setup.push(`ALTER TABLE "${schema}"."${tablename}" ENABLE ROW LEVEL SECURITY`);
  }
  setup.push(`REVOKE ALL ON SCHEMA "${schema}" FROM anon, authenticated`, `REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM anon, authenticated`);
  assert.ok(setup.every(sql => !sql.includes("$ddl$") && !sql.includes("$setup$")));
  // One atomic server-side setup avoids a round trip for every test DDL statement.
  await isolated.$executeRawUnsafe(`DO $setup$ BEGIN
    PERFORM set_config('search_path', '"${schema}"', true);
    ${setup.map(sql => `EXECUTE $ddl$${sql}$ddl$;`).join("\n")}
  END $setup$`);
  console.log("Starting isolated local UI server");
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3129"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  const capture = chunk => { logs += chunk; writeFileSync("tmp/order-edit-ui-server.log", logs); };
  server.stdout.on("data", capture); server.stderr.on("data", capture);
  const deadline = Date.now() + 120000; let ready = false;
  while (Date.now() < deadline && server.exitCode === null) {
    try { const response = await fetch("http://127.0.0.1:3129/login", { signal: AbortSignal.timeout(5000) }); if (response.ok) { ready = true; break; } } catch { /* server startup */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Isolated UI server did not become ready");
  try { await run(require.resolve("@playwright/test/cli"), ["test", "--config", "playwright.order-edit.config.ts"]); }
  finally { writeFileSync("tmp/order-edit-ui-server.log", logs); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* already stopped */ } }
    else server.kill("SIGTERM");
  }
  await isolated.$disconnect();
  if (created) { assert.match(schema, /^order_edit_ui_[a-f0-9_]+$/); await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
  for (const [file, content] of backups) writeFileSync(file, content);
  const after = await businessFingerprint();
  assert.deepEqual(after, before, "Public business data changed during isolated UI tests");
  await root.$disconnect();
  console.log("Isolated schema removed; public business data unchanged");
}
