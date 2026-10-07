import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../../src/lib/auth";
import { loadOrderFormInsights } from "../../src/lib/order-form-insights";
import { getCustomerPaymentReliability } from "../../src/lib/customer-payment-reliability";
import { customerInvoiceBalanceSelect } from "../../src/lib/customer-payment-query";
import { buildDemoDataset, DEMO_TABLE_ORDER, verifyDemoDataset, type DemoAccounts, type DemoDataset, type DemoRow } from "./dataset";

type Db = Pick<Prisma.TransactionClient, "$queryRawUnsafe" | "$executeRawUnsafe">;
type StorageFile = { name: string; archiveName: string; sha256: string; size: number };
type Snapshot = { tables: Record<string, DemoRow[]>; fingerprint: string; counts: Record<string, number> };
type Backup = Snapshot & { format: "cv-tajuk-application-backup-v1"; target: string; bucket: string; createdAt: string;
  files: StorageFile[]; columns: DemoRow[]; constraints: DemoRow[]; migrationsFingerprint: string };

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function hash(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function q(value: string) { assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value), "Invalid SQL identifier"); return `"${value}"`; }
function qualified(schema: string, table: string) { return `${q(schema)}.${q(table)}`; }
function flag(name: string) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
function projectRef() {
  const endpoint = new URL(process.env.SUPABASE_URL ?? "http://localhost:54321");
  return endpoint.hostname.endsWith(".supabase.co") ? endpoint.hostname.split(".")[0] : endpoint.hostname;
}
function storageClient() {
  assert(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY, "Supabase Storage endpoint and server key are required");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function tableNames(db: Db, schema = "public") {
  const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>("SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename", schema);
  return rows.map(row => row.tablename);
}
async function snapshot(db: Db, schema = "public"): Promise<Snapshot> {
  const tables: Record<string, DemoRow[]> = {};
  for (const table of await tableNames(db, schema)) {
    const rows = await db.$queryRawUnsafe<Array<{ rows: DemoRow[] }>>(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM ${qualified(schema, table)} t`);
    tables[table] = rows[0].rows;
  }
  return { tables, fingerprint: hash(stable(tables)), counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])) };
}
async function metadata(db: Db) {
  const constraints = await db.$queryRawUnsafe<DemoRow[]>(`SELECT c.conname AS name, t.relname AS table_name, c.contype::text AS type,
    c.convalidated AS validated, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND c.contype IN ('c','f') ORDER BY c.contype, t.relname, c.conname`);
  const columns = await db.$queryRawUnsafe<DemoRow[]>(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
  return { constraints, columns };
}
async function listStorageFiles(bucket: string) {
  const client = storageClient(); const names: string[] = [];
  async function walk(prefix: string) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      assert(!error && data, `Unable to list PO Storage: ${error?.message}`);
      for (const item of data) { const name = prefix ? `${prefix}/${item.name}` : item.name;
        if (!item.id && !item.metadata) await walk(name); else names.push(name); }
      if (data.length < 100) break;
    }
  }
  const { data: buckets, error } = await client.storage.listBuckets(); assert(!error, `Unable to list buckets: ${error?.message}`);
  if (buckets?.some(b => b.name === bucket)) await walk("");
  return names;
}
async function createBackup(db: PrismaClient, directory: string, target: string, bucket: string): Promise<Backup> {
  // Capture rows consistently. No production records are changed by backup.
  const data = await db.$transaction(tx => snapshot(tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 90000 });
  const meta = await metadata(db);
  await mkdir(join(directory, "storage"), { recursive: true });
  await writeFile(join(directory, "database.json"), JSON.stringify(data, null, 2), { flag: "wx" });
  const client = storageClient(); const files: StorageFile[] = [];
  const names = await listStorageFiles(bucket);
  for (const [index, name] of names.entries()) {
    const { data: file, error } = await client.storage.from(bucket).download(name);
    assert(!error && file, `Unable to archive PO file ${index + 1}: ${error?.message}`);
    const bytes = Buffer.from(await file.arrayBuffer()); const archiveName = `${hash(name)}.bin`;
    await writeFile(join(directory, "storage", archiveName), bytes, { flag: "wx" });
    files.push({ name, archiveName, sha256: hash(bytes), size: bytes.length });
    if ((index + 1) % 5 === 0) console.log(`Archived PO attachments: ${index + 1}/${names.length}`);
  }
  const backup: Backup = { ...data, ...meta, format: "cv-tajuk-application-backup-v1", target, bucket,
    createdAt: new Date().toISOString(), files, migrationsFingerprint: hash(stable(data.tables._prisma_migrations ?? [])) };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(backup, null, 2), { flag: "wx" });
  await verifyBackup(directory, target);
  console.log(JSON.stringify({ backup: directory, counts: data.counts, storageFiles: files.length }));
  return backup;
}
async function verifyBackup(directory: string, target: string): Promise<Backup> {
  const backup = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as Backup;
  assert(backup.format === "cv-tajuk-application-backup-v1" && backup.target === target, "Backup format/target mismatch");
  assert(hash(stable(backup.tables)) === backup.fingerprint, "Database backup checksum mismatch");
  const databaseFile = JSON.parse(await readFile(join(directory, "database.json"), "utf8")) as Snapshot;
  assert(databaseFile.fingerprint === backup.fingerprint && hash(stable(databaseFile.tables)) === backup.fingerprint, "Database archive and manifest disagree");
  for (const file of backup.files) {
    assert(/^[a-f0-9]{64}\.bin$/.test(file.archiveName), "Unsafe storage archive filename");
    const bytes = await readFile(join(directory, "storage", file.archiveName));
    assert(bytes.length === file.size && hash(bytes) === file.sha256, "Storage backup checksum mismatch");
  }
  return backup;
}
function prepareDataset(backup: Snapshot, anchorDate?: string) {
  const users = backup.tables.users ?? []; const accounts = {} as DemoAccounts; const newUsers: DemoRow[] = [];
  for (const [username, role, password] of [["admin", "ADMIN", "Admin123!"], ["sales", "SALES", "Sales123!"], ["manager", "MANAGER", "Manager123!"]]) {
    let user = users.find(row => row.username === username);
    if (!user) {
      user = { id: `demo-v1-user-${username}`, username, password_hash: hashPassword(password), display_name: `${role[0]}${role.slice(1).toLowerCase()} Demo`,
        role, status: "Active", session_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; newUsers.push(user);
    }
    assert(user.role === role && user.status === "Active", `Existing ${username} account has an unexpected role/status; it was not changed`);
    accounts[username as keyof DemoAccounts] = { id: String(user.id), username, displayName: String(user.display_name), role };
  }
  const dataset = buildDemoDataset(accounts, anchorDate, Number(process.env.PPN_RATE_BASIS_POINTS ?? 1100));
  // Preserve all ordinary accounts and their credentials/session versions. Only identified SIT fixtures are removed.
  const testUsers = users.filter(row => /^sit(?:_|2_)/i.test(String(row.username)));
  const retainedUsers = users.filter(row => !testUsers.includes(row));
  return { dataset, accounts, retainedUsers, newUsers, testUsers };
}
async function insertRows(db: Db, schema: string, table: string, rows: DemoRow[]) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const target = qualified(schema, table); const names = columns.map(q).join(", ");
  await db.$executeRawUnsafe(`INSERT INTO ${target} (${names}) SELECT ${names} FROM jsonb_populate_recordset(NULL::${target}, $1::jsonb)`, JSON.stringify(rows));
}
async function replaceRows(db: Db, schema: string, prepared: ReturnType<typeof prepareDataset>) {
  const present = await tableNames(db, schema); const known = new Set<string>([...DEMO_TABLE_ORDER, "_prisma_migrations"]);
  assert(present.every(table => known.has(table)), "Unrecognized public table; replacement aborted instead of guessing its ownership");
  for (const table of [...DEMO_TABLE_ORDER].reverse()) {
    if (table !== "users" && present.includes(table)) await db.$executeRawUnsafe(`DELETE FROM ${qualified(schema, table)}`);
  }
  if (prepared.testUsers.length) {
    await db.$executeRawUnsafe(`DELETE FROM ${qualified(schema, "users")} WHERE id = ANY($1::text[])`, prepared.testUsers.map(row => String(row.id)));
  }
  await insertRows(db, schema, "users", prepared.newUsers);
  for (const table of DEMO_TABLE_ORDER) if (table !== "users" && present.includes(table)) await insertRows(db, schema, table, prepared.dataset.tables[table]);
  assert(present.includes("product_cost_history"), "Product cost history migration must exist; transaction will roll back");
  return verifyDatabase(db, schema, prepared.dataset);
}
async function verifyDatabase(db: Db, schema: string, expected: DemoDataset) {
  const stored = await snapshot(db, schema); const actual = { ...expected, tables: { ...expected.tables, ...stored.tables } };
  const summary = verifyDemoDataset(actual);
  for (const table of DEMO_TABLE_ORDER.filter(table => table !== "users" && !table.startsWith("dashboard"))) {
    assert(stored.counts[table] === expected.tables[table].length, `${table}: row count differs from baseline`);
  }
  for (const table of ["customers", "products", "sales_orders", "invoices", "customer_inquiries"]) {
    assert(stored.tables[table].every(row => String(row.id).startsWith("demo-v1-")), `${table}: legacy records remain`);
  }
  return summary;
}
async function validateInScratch(db: PrismaClient, backup: Backup, prepared: ReturnType<typeof prepareDataset>) {
  const schema = `demo_seed_check_${randomUUID().replaceAll("-", "")}`;
  const tables = DEMO_TABLE_ORDER.filter(table => backup.tables[table]);
  console.log("Validating backup restore and new dataset in an isolated private schema...");
  await db.$executeRawUnsafe(`CREATE SCHEMA ${q(schema)}`);
  try {
    await db.$executeRawUnsafe(`REVOKE ALL ON SCHEMA ${q(schema)} FROM PUBLIC`);
    // Give Prisma genuine schema-local enum types and remap the cloned columns.
    // All enum DDL stays inside this isolated schema.
    const enums = await db.$queryRawUnsafe<Array<{ name: string; labels: string[] }>>("SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname");
    for (const type of enums) await db.$executeRawUnsafe(`CREATE TYPE ${qualified(schema, type.name)} AS ENUM (${type.labels.map(label => `'${label.replaceAll("'", "''")}'`).join(", ")})`);
    await db.$transaction(async tx => {
      for (const table of tables) await tx.$executeRawUnsafe(`CREATE TABLE ${qualified(schema, table)} (LIKE ${qualified("public", table)} INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING INDEXES)`);
      for (const column of backup.columns.filter(column => enums.some(type => type.name === column.udt_name) && tables.includes(String(column.table_name) as typeof tables[number]))) {
        const table = qualified(schema, String(column.table_name)); const name = q(String(column.column_name)); const type = qualified(schema, String(column.udt_name));
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} DROP DEFAULT`);
        await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} TYPE ${type} USING ${name}::text::${type}`);
        if (column.column_default) await tx.$executeRawUnsafe(`ALTER TABLE ${table} ALTER COLUMN ${name} SET DEFAULT (${column.column_default})::text::${type}`);
      }
      // Restore every archived row first, then restore checks/FKs (including legacy NOT VALID checks).
      for (const table of tables) await insertRows(tx, schema, table, backup.tables[table]);
      for (const constraint of backup.constraints) {
        if (!tables.includes(String(constraint.table_name) as typeof tables[number])) continue;
        let definition = String(constraint.definition).replace(/REFERENCES\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/g,
          (_match, parent: string) => `REFERENCES ${qualified(schema, parent)}`);
        for (const type of enums) definition = definition.replace(new RegExp(`::(?:public\\.)?${type.name}\\b`, "g"), `::${qualified(schema, type.name)}`);
        await tx.$executeRawUnsafe(`ALTER TABLE ${qualified(schema, String(constraint.table_name))} ADD CONSTRAINT ${q(String(constraint.name))} ${definition}`);
      }
      const restored = await snapshot(tx, schema);
      for (const table of tables) assert(hash(stable(restored.tables[table])) === hash(stable(backup.tables[table])), `Restore round-trip failed: ${table}`);
      await replaceRows(tx, schema, prepared);
    }, { timeout: 120000, maxWait: 10000 });
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set("schema", schema);
    const scratch = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const insights = await loadOrderFormInsights(scratch, new Date(`${prepared.dataset.anchorDate}T12:00:00+07:00`), { portfolioOwnerUserId: prepared.accounts.sales.id });
      assert(insights.customers.length === 15 && insights.products.length === 10, "Sales portfolio cannot see the full demo catalog");
      assert(insights.products.every(product => product.averageProductionCost !== null), "Missing 30-day product cost examples");
      const customers = await scratch.customer.findMany({ select: { companyName: true, invoices: { select: customerInvoiceBalanceSelect } } });
      const labels = new Set(customers.map(customer => getCustomerPaymentReliability(customer, new Date(`${prepared.dataset.anchorDate}T12:00:00+07:00`)).label));
      assert(labels.has("On-Time Payer") && labels.has("Late Payer") && labels.has("No Payment History"), "Payment reliability scenarios are incomplete");
      console.log(JSON.stringify({ scratchValidation: "passed", backupRestore: "passed", paymentReliability: [...labels] }));
    } finally { await scratch.$disconnect(); }
  } finally {
    // This exact random schema was created by this operation; public is never a cleanup target.
    assert(/^demo_seed_check_[a-f0-9]{32}$/.test(schema), "Unsafe scratch cleanup target");
    await db.$executeRawUnsafe(`DROP SCHEMA ${q(schema)} CASCADE`);
  }
}
async function preparePdfs(dataset: DemoDataset, directory: string, python: string) {
  await mkdir(directory, { recursive: true });
  const manifest = join(directory, "documents.json"); await writeFile(manifest, JSON.stringify(dataset));
  const child = spawnSync(python, [resolve("prisma/demo/generate-po-pdfs.py"), manifest, directory], { encoding: "utf8", windowsHide: true });
  assert(child.status === 0, `PO PDF generation failed: ${child.error?.message ?? child.stderr}`);
  for (const document of dataset.documents) {
    const bytes = await readFile(join(directory, document.fileName)); assert(bytes.subarray(0, 5).toString() === "%PDF-", "Invalid PDF attachment");
    const order = dataset.tables.sales_orders.find(row => row.id === document.orderId)!;
    order.customer_po_document_size = bytes.length; order.customer_po_document_sha256 = hash(bytes);
  }
  console.log(child.stdout.trim());
}
async function uploadPdfs(dataset: DemoDataset, directory: string, bucket: string, runId: string, staged: string[]) {
  const client = storageClient();
  const { data: buckets, error: bucketError } = await client.storage.listBuckets(); assert(!bucketError, `Unable to inspect buckets: ${bucketError?.message}`);
  if (!buckets?.some(b => b.name === bucket)) {
    const { error } = await client.storage.createBucket(bucket, { public: false, allowedMimeTypes: ["application/pdf"], fileSizeLimit: 8 * 1024 * 1024 });
    assert(!error, `Unable to create private PO bucket: ${error?.message}`);
  }
  for (const document of dataset.documents) {
    const bytes = await readFile(join(directory, document.fileName));
    document.storedName = document.storedName.replace(`/${dataset.anchorDate}/`, `/${dataset.anchorDate}/${runId}/`);
    const { error } = await client.storage.from(bucket).upload(document.storedName, bytes, { contentType: "application/pdf", upsert: false });
    assert(!error, `Unable to stage demo PO: ${error?.message}`);
    staged.push(document.storedName);
    const { data: downloaded, error: readError } = await client.storage.from(bucket).download(document.storedName);
    assert(!readError && downloaded && hash(Buffer.from(await downloaded.arrayBuffer())) === hash(bytes), "Uploaded PO checksum mismatch");
    dataset.tables.sales_orders.find(row => row.id === document.orderId)!.customer_po_document_stored_name = document.storedName;
  }
}
async function cleanupArchivedFiles(backup: Backup) {
  const client = storageClient(); const unchanged: string[] = []; const retained: string[] = [];
  for (const file of backup.files) {
    const { data, error } = await client.storage.from(backup.bucket).download(file.name);
    if (error || !data || hash(Buffer.from(await data.arrayBuffer())) !== file.sha256) retained.push(file.name);
    else unchanged.push(file.name);
  }
  for (let i = 0; i < unchanged.length; i += 100) {
    const { error } = await client.storage.from(backup.bucket).remove(unchanged.slice(i, i + 100));
    assert(!error, `Old PO cleanup failed (database replacement succeeded): ${error?.message}`);
  }
  return { archivedFilesRemoved: unchanged.length, changedOrMissingFilesRetained: retained };
}
async function lockApplication(db: Db, tables: string[]) {
  await db.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
  await db.$executeRawUnsafe(`LOCK TABLE ${tables.filter(table => table !== "_prisma_migrations").map(table => qualified("public", table)).join(", ")} IN EXCLUSIVE MODE`);
}

export async function runDemoSeed() {
  config({ path: ".env.local", quiet: true }); config({ quiet: true });
  const apply = process.argv.includes("--apply"); const validate = process.argv.includes("--validate");
  const pdfOnly = process.argv.includes("--pdf-preview"); const anchorDate = flag("--date");
  const python = flag("--python") ?? process.env.DEMO_PYTHON ?? "python";
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  if (!apply && !validate) {
    const preview = prepareDataset({ tables: {}, fingerprint: "", counts: {} }, anchorDate).dataset;
    const summary = verifyDemoDataset(preview);
    if (pdfOnly) await preparePdfs(preview, resolve("output/pdf/demo-po"), python);
    console.log(JSON.stringify({ mode: "preview", ...summary, note: "No database records were changed. Use --validate or --apply --target <project-ref>." }, null, 2));
    return;
  }
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const target = projectRef(); assert(flag("--target") === target, "Supply --target matching the actual Supabase project reference/localhost");
  const dbUrl = new URL(process.env.DATABASE_URL);
  assert(dbUrl.hostname === "localhost" || dbUrl.hostname === "127.0.0.1" || dbUrl.hostname.includes(target) || decodeURIComponent(dbUrl.username).endsWith(`.${target}`), "Database and Supabase Storage target do not match");
  assert(!dbUrl.searchParams.get("schema") || dbUrl.searchParams.get("schema") === "public", "This command only replaces the application's public schema data");
  const db = new PrismaClient(); const existingBackup = flag("--backup");
  const directory = existingBackup ? resolve(existingBackup) : resolve("output/demo-backups", runId);
  const bucket = process.env.SUPABASE_CUSTOMER_PO_BUCKET ?? process.env.SUPABASE_PRE_ORDER_BUCKET ?? "pre-order-documents";
  const staged: string[] = []; let committed = false;
  try {
    const backup = existingBackup ? await verifyBackup(directory, target) : await createBackup(db, directory, target, bucket);
    assert(backup.bucket === bucket, "Backup bucket does not match the current PO bucket");
    const prepared = prepareDataset(backup, anchorDate);
    console.log(JSON.stringify({ proposed: verifyDemoDataset(prepared.dataset), retainedAccounts: prepared.retainedUsers.map(row => row.username), removedTestAccounts: prepared.testUsers.map(row => row.username) }));
    await validateInScratch(db, backup, prepared);
    await writeFile(join(directory, "validation.json"), JSON.stringify({ status: "passed", backupRestore: "passed", proposed: verifyDemoDataset(prepared.dataset) }, null, 2));
    if (!apply) { console.log("Validation completed; live application data was not changed."); return; }
    const pdfDirectory = resolve("output/pdf/demo-po"); await preparePdfs(prepared.dataset, pdfDirectory, python);
    await uploadPdfs(prepared.dataset, pdfDirectory, bucket, runId, staged);
    console.log("Replacing application data in one transaction; accounts, schema, RLS, and migrations are preserved...");
    const summary = await db.$transaction(async tx => {
      await lockApplication(tx, Object.keys(backup.tables));
      assert((await snapshot(tx)).fingerprint === backup.fingerprint, "Live data changed after backup; replacement aborted without deleting records. Run again for a fresh backup.");
      const result = await replaceRows(tx, "public", prepared);
      const refresh = await tx.$queryRawUnsafe<Array<{ run_id: bigint }>>("SELECT dashboard_private.refresh_dashboard_analysis('MANUAL', $1::text) AS run_id", prepared.accounts.manager.id);
      const runs = await tx.$queryRawUnsafe<Array<{ status: string }>>("SELECT status FROM public.dashboard_analysis_runs WHERE id=$1", refresh[0].run_id);
      assert(runs[0].status === "SUCCEEDED", "Dashboard refresh failed; replacement will roll back");
      const currentUsers = await tx.$queryRawUnsafe<DemoRow[]>("SELECT to_jsonb(u) AS row FROM public.users u ORDER BY username");
      for (const old of prepared.retainedUsers) {
        const found = currentUsers.map(row => row.row as DemoRow).find(row => row.id === old.id);
        assert(found && hash(stable(found)) === hash(stable(old)), "An existing account changed unexpectedly; replacement will roll back");
      }
      const migrations = await tx.$queryRawUnsafe<Array<{ rows: DemoRow[] }>>("SELECT jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)::text) AS rows FROM public._prisma_migrations m");
      assert(hash(stable(migrations[0].rows)) === backup.migrationsFingerprint, "Migration history changed unexpectedly");
      return result;
    }, { timeout: 90000, maxWait: 15000 });
    committed = true;
    // Write success before Storage cleanup so a cleanup failure never disguises a committed database replacement.
    await writeFile(join(directory, "result.json"), JSON.stringify({ status: "database-replaced", summary, retainedAccounts: prepared.retainedUsers.map(row => row.username), documents: prepared.dataset.documents }, null, 2));
    const cleanup = await cleanupArchivedFiles(backup);
    await writeFile(join(directory, "result.json"), JSON.stringify({ status: "complete", summary, cleanup, retainedAccounts: prepared.retainedUsers.map(row => row.username), documents: prepared.dataset.documents }, null, 2));
    console.log(JSON.stringify({ status: "complete", backup: directory, summary, cleanup }, null, 2));
  } finally {
    if (!committed && staged.length) {
      const { error } = await storageClient().storage.from(bucket).remove(staged);
      if (error) console.error(`Uncommitted attachment cleanup failed: ${error.message}`);
    }
    await db.$disconnect();
  }
}
