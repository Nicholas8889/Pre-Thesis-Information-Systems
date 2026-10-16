import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const require = createRequire(import.meta.url);
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-flow-cde-2026-10-16";
assert.match(out, /^outputs\/[a-zA-Z0-9._-]+$/);
mkdirSync(out, { recursive: true });
const schema = `sit_umkm_${Date.now().toString(16)}_${randomBytes(4).toString("hex")}`;
assert.match(schema, /^sit_umkm_[a-f0-9_]+$/);
const scopedUrl = raw => { const u = new URL(raw); u.searchParams.set("schema", schema); u.searchParams.set("connection_limit", "3"); u.searchParams.set("pool_timeout", "20"); return u.toString(); };
const env = { ...process.env, SIT_UMKM_OUTPUT_DIR: out, DATABASE_URL: scopedUrl(process.env.DATABASE_URL),
  DIRECT_URL: scopedUrl(process.env.DIRECT_URL || process.env.DATABASE_URL),
  AUTH_SECRET: randomBytes(32).toString("hex"), SIT_UMKM_SCHEMA: schema,
  ORDER_EDIT_TEST_DIST_DIR: ".next-uat-admin", SUPABASE_CUSTOMER_PO_BUCKET: schema.replaceAll("_", "-") };
const rootUrl = new URL(process.env.DATABASE_URL); rootUrl.searchParams.set("connection_limit", "2");
const root = new PrismaClient({ datasourceUrl: rootUrl.toString() });
const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const backups = new Map(["next-env.d.ts", "tsconfig.json", "tsconfig.tsbuildinfo"].map(p => [p, readFileSync(p)]));
const state = { date: process.env.SIT_UMKM_DATE || "2026-10-16", scale: "UMKM: isolated empty schema, small fixtures, at most 2-3 simultaneous submissions", schema,
  integrationExit: null, browserExit: null, publicUnchanged: false, schemaRemoved: false, storageRemoved: false };
let created = false, server, serverLog = "", before;
const browserFocus = process.argv.find(arg => arg.startsWith("--browser-focus="))?.slice(16);
function run(cli, args, logName) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      log += chunk.toString(); writeFileSync(`${out}/${logName}`, log);
    });
    child.on("error", reject); child.on("exit", code => resolve(code));
  });
}
async function fingerprint() {
  const tables = await root.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const result = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    const [value] = await root.$queryRawUnsafe(`SELECT count(*)::integer AS count, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS hash FROM public."${tablename}" t`);
    result[tablename] = value;
  }
  return result;
}
async function prepare() {
  const tables = await root.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  assert.ok(tables.length > 0);
  await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
  const [scope] = await db.$queryRaw`SELECT current_schema() AS schema`;
  assert.equal(scope.schema, schema);
  // Clone structure only. LIKE includes current checks/indexes/defaults but copies no business rows.
  const ddl = [];
  const enums = await root.$queryRaw`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`;
  for (const { typname, labels } of enums) {
    assert.match(typname, /^[a-z0-9_]+$/);
    ddl.push(`CREATE TYPE "${schema}"."${typname}" AS ENUM (${labels.map(label => "'" + label.replaceAll("'", "''") + "'").join(",")})`);
  }
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z0-9_]+$/);
    ddl.push(`CREATE TABLE "${schema}"."${tablename}" (LIKE public."${tablename}" INCLUDING ALL EXCLUDING CONSTRAINTS)`);
  }
  // Serial defaults copied by LIKE must never advance a production sequence.
  const serials = await root.$queryRaw`SELECT table_name, column_name, column_default
    FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE '%nextval(%'`;
  const copiedSequences = new Set();
  for (const serial of serials) {
    const match = /nextval\('(?:public\.)?([a-z0-9_]+)'::regclass\)/.exec(serial.column_default);
    assert.ok(match, "Unexpected serial default; isolation needs explicit review");
    const sequence = match[1];
    assert.match(serial.table_name, /^[a-z0-9_]+$/); assert.match(serial.column_name, /^[a-z0-9_]+$/);
    if (!copiedSequences.has(sequence)) {
      ddl.push(`CREATE SEQUENCE "${schema}"."${sequence}"`); copiedSequences.add(sequence);
    }
    ddl.push(`ALTER TABLE "${schema}"."${serial.table_name}" ALTER COLUMN "${serial.column_name}" SET DEFAULT nextval('"${schema}"."${sequence}"'::regclass)`);
    ddl.push(`ALTER SEQUENCE "${schema}"."${sequence}" OWNED BY "${schema}"."${serial.table_name}"."${serial.column_name}"`);
  }
  const enumColumns = await root.$queryRaw`SELECT c.relname AS tablename, a.attname AS columnname, t.typname,
    pg_get_expr(d.adbin,d.adrelid) AS defaultvalue
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND t.typtype='e'`;
  for (const col of enumColumns) {
    for (const name of [col.tablename, col.columnname, col.typname]) assert.match(name, /^[a-z0-9_]+$/);
    const target = `"${schema}"."${col.tablename}"`, column = `"${col.columnname}"`;
    if (col.defaultvalue) ddl.push(`ALTER TABLE ${target} ALTER COLUMN ${column} DROP DEFAULT`);
    ddl.push(`ALTER TABLE ${target} ALTER COLUMN ${column} TYPE "${schema}"."${col.typname}" USING ${column}::text::"${schema}"."${col.typname}"`);
    if (col.defaultvalue) ddl.push(`ALTER TABLE ${target} ALTER COLUMN ${column} SET DEFAULT ${col.defaultvalue.replaceAll("public.", `"${schema}".`)}`);
  }
  const checks = await root.$queryRaw`SELECT c.conname, cl.relname AS tablename, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND c.contype='c' ORDER BY cl.relname,c.conname`;
  for (const check of checks) {
    assert.match(check.tablename, /^[a-z0-9_]+$/); assert.match(check.conname, /^[a-zA-Z0-9_]+$/);
    ddl.push(`ALTER TABLE "${schema}"."${check.tablename}" ADD CONSTRAINT "${check.conname}" ${check.definition.replaceAll("public.", `"${schema}".`)}`);
  }
  const keys = await root.$queryRaw`SELECT c.conname, cl.relname AS tablename, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='public' AND c.contype='f' ORDER BY cl.relname,c.conname`;
  for (const key of keys) {
    assert.match(key.tablename, /^[a-z0-9_]+$/); assert.match(key.conname, /^[a-zA-Z0-9_]+$/);
    const definition = key.definition.replaceAll("public.", `"${schema}".`);
    ddl.push(`ALTER TABLE "${schema}"."${key.tablename}" ADD CONSTRAINT "${key.conname}" ${definition}`);
  }
  const functions = await root.$queryRaw`SELECT DISTINCT p.oid, pg_get_functiondef(p.oid) AS definition
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal`;
  for (const fn of functions) ddl.push(fn.definition.replaceAll("public.", `"${schema}".`));
  const triggers = await root.$queryRaw`SELECT pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal`;
  for (const trigger of triggers) ddl.push(trigger.definition.replaceAll("public.", `"${schema}".`));
  for (const { tablename } of tables) ddl.push(`ALTER TABLE "${schema}"."${tablename}" ENABLE ROW LEVEL SECURITY`);
  ddl.push(`REVOKE ALL ON SCHEMA "${schema}" FROM anon, authenticated`, `REVOKE ALL ON ALL TABLES IN SCHEMA "${schema}" FROM anon, authenticated`);
  assert.ok(ddl.every(sql => !sql.includes("$umkm_ddl$") && !sql.includes("$umkm_setup$")));
  await db.$executeRawUnsafe(`DO $umkm_setup$ BEGIN PERFORM set_config('search_path', '"${schema}", public', true);
    ${ddl.map(sql => `EXECUTE $umkm_ddl$${sql}$umkm_ddl$;`).join("\n")} END $umkm_setup$`);
  state.tableCount = tables.length; state.foreignKeys = keys.length; state.triggers = triggers.length;
  writeFileSync(`${out}/active-run-state.json`, JSON.stringify(state, null, 2));
  console.log(`Isolated empty schema ready: ${tables.length} tables, ${keys.length} foreign keys, ${triggers.length} triggers`);
}
async function startServer() {
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3137"],
    { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => { serverLog += chunk; writeFileSync(`${out}/server.log`, serverLog); });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && server.exitCode === null) {
    try { if ((await fetch("http://127.0.0.1:3137/login", { signal: AbortSignal.timeout(5000) })).ok) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("UMKM test server did not become ready");
}
try {
  before = await fingerprint(); writeFileSync(`${out}/public-before.json`, JSON.stringify(before, null, 2));
  await prepare();
  console.log("Starting local isolated app and UAT browser tests"); await startServer();
  state.browserExit = await run(require.resolve("@playwright/test/cli"), ["test", "--config", "playwright.uat-flow-cde.config.ts", ...(browserFocus ? ["--grep", browserFocus] : [])], "browser-run.log");
  console.log(`Browser run complete: exit ${state.browserExit}`);
} catch (error) { state.error = error.message; console.error(error.message); process.exitCode = 1; }
finally {
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* stopped */ } }
    else server.kill("SIGTERM");
  }
  await db.$disconnect();
  if (!process.argv.includes("--integration-only") && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
    const bucket = env.SUPABASE_CUSTOMER_PO_BUCKET;
    assert.equal(bucket, schema.replaceAll("_", "-")); assert.match(bucket, /^sit-umkm-[a-f0-9-]+$/);
    const lookup = await storage.getBucket(bucket);
    if (lookup.data) {
      // Remove the bounded test objects explicitly; emptyBucket can finish asynchronously.
      const listed = await storage.from(bucket).list("customer-purchase-orders", { limit: 100 });
      const paths = (listed.data || []).filter(file => file.id).map(file => {
        assert.match(file.name, /^[a-zA-Z0-9._-]+$/);
        return `customer-purchase-orders/${file.name}`;
      });
      const deleted = listed.error ? { error: listed.error } : paths.length ? await storage.from(bucket).remove(paths) : { error: null };
      if (deleted.error) { state.storageCleanupError = deleted.error.message; process.exitCode = 1; }
      else {
        const removed = await storage.deleteBucket(bucket); state.storageRemoved = !removed.error;
        if (removed.error) { state.storageCleanupError = removed.error.message; process.exitCode = 1; }
      }
    } else state.storageRemoved = true;
  }
  for (const [p, bytes] of backups) writeFileSync(p, bytes);
  if (created) {
    assert.match(schema, /^sit_umkm_[a-f0-9_]+$/);
    try { await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); state.schemaRemoved = true; }
    catch(error) { state.schemaCleanupError = error.message; process.exitCode = 1; }
  }
  if (before) {
    try {
      const after = await fingerprint(); writeFileSync(`${out}/public-after.json`, JSON.stringify(after, null, 2));
      state.publicUnchanged = JSON.stringify(before) === JSON.stringify(after);
      if (!state.publicUnchanged) { state.error = "Public data fingerprint changed; review public-before/public-after"; process.exitCode = 1; }
    } catch(error) { state.fingerprintError = error.message; process.exitCode = 1; }
  }
  await root.$disconnect();
  writeFileSync(`${out}/run-browser-summary.json`, JSON.stringify(state, null, 2));
  console.log(`Cleanup: schema removed=${state.schemaRemoved}; public unchanged=${state.publicUnchanged}`);
  if (state.integrationExit || state.browserExit) process.exitCode = 1;
}
