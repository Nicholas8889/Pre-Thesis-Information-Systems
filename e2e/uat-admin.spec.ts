import { PrismaClient, type Product, type User, type Invoice } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot } from "../src/lib/invoice-snapshot";
import { formatCurrency, formatInvoiceCurrency, formatDate } from "../src/lib/format";
import { getDueDateForPaymentTerm } from "../src/lib/workflow";

const db = new PrismaClient();
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-admin-2026-10-15";
const password = "UAT-Simulation-Only-123!";
let admin: User, sales: User, product: Product;
const limits: Record<string, number> = { A1: 6, A2: 8, A3: 8, A4: 20, A5: 10, A6: 4, A7: 8 };
let started = 0;
let record: {
  scenario: string; title: string; role: string; limitMinutes: number;
  checkpoints: Record<string, unknown>[]; method: string;
  result?: string; durationSeconds?: number | null; withinAutomationLimit?: boolean | null; errors?: (string | undefined)[];
};

function checkpoint(name: string, data: Record<string, unknown> = {}) {
  record.checkpoints.push({ name, ...data });
  writeFileSync(`${out}/${record.scenario}-evidence.json`, JSON.stringify(record, null, 2));
}
async function shot(page: Page, name: string) {
  const path = `${out}/${record.scenario}-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  checkpoint(name, { screenshot: path, url: page.url() });
}

test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Must use isolated UAT runner");
  const [scope] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(schema);
  for (const role of ["ADMIN", "SALES"] as const) {
    const user = await db.user.upsert({ where: { username: `uat_${role.toLowerCase()}` }, update: {},
      create: { username: `uat_${role.toLowerCase()}`, displayName: `UAT ${role}`, role, passwordHash: hashPassword(password) } });
    if (role === "ADMIN") admin = user; else sales = user;
  }
  product = await db.product.upsert({ where: { sku: "UAT-FIXTURE-KATUN" }, update: {},
    create: { sku: "UAT-FIXTURE-KATUN", productName: "Kain Fixture UAT", listPrice: 30000 } });
});
test.beforeEach(async ({ page }, info) => {
  const scenario = info.title.slice(0, 2);
  record = { scenario, title: info.title, role: "ADMIN", limitMinutes: limits[scenario], checkpoints: [],
    method: "Guided browser automation; fixture setup and login excluded from scenario time" };
  started = 0;
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Username", exact: true }).fill(admin.username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/");
});
test.afterEach(async ({ page }, info) => {
  record.result = info.status;
  record.durationSeconds = started ? Math.round((Date.now() - started) / 100) / 10 : null;
  record.withinAutomationLimit = record.durationSeconds !== null && record.durationSeconds !== undefined
    ? record.durationSeconds <= record.limitMinutes * 60 : null;
  record.errors = info.errors.map(error => error.message);
  if (info.status !== "passed") {
    try { await shot(page, "failure"); } catch { /* Preserve original failure. */ }
  }
  writeFileSync(`${out}/${record.scenario}-evidence.json`, JSON.stringify(record, null, 2));
});
test.afterAll(async () => { await db.$disconnect(); });

async function submit(page: Page, trigger: Locator, note = "Simulasi UAT Admin") {
  await page.waitForLoadState("networkidle");
  const response = page.waitForResponse(r => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]), { timeout: 60_000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /^Confirm / });
  const mode = await Promise.race([
    dialog.waitFor({ state: "visible", timeout: 5_000 }).then(() => "confirm").catch(() => "no-dialog"),
    response.then(() => "sent")
  ]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill(note);
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  }
  await response;
  await expect(dialog).toBeHidden();
}

async function fixture(key: string, opts: { invoice?: boolean; partial?: boolean; overdue?: boolean } = {}) {
  const customer = await db.customer.create({ data: {
    name: `Ibu Rina ${key}`, companyName: `PT Simulasi UAT ${key}`, phone: "081234567890",
    email: `uat-${key.toLowerCase()}@example.test`, address: "Jl. Simulasi UAT 15, Jakarta", customerSegment: "Retail",
    portfolioOwnerUserId: sales.id, notes: "Data fiktif khusus simulasi UAT" } });
  const order = await db.salesOrder.create({ data: {
    orderNumber: `SO-UAT-${key}`, customerId: customer.id, createdByUserId: sales.id,
    orderDate: new Date("2026-10-01T03:00:00Z"), status: opts.invoice ? "Invoiced" : "Confirmed",
    deliveryDestinationSnapshot: customer.address, subtotal: 5_000_000, total: 5_000_000, netSalesAmount: 5_000_000,
    paymentTermType: "CREDIT", creditTermWeeks: 1,
    items: { create: { productId: product.id, productSkuSnapshot: product.sku, itemName: product.productName,
      quantity: 100, baseUnitPrice: 50_000, finalUnitPrice: 50_000, subtotal: 5_000_000 } }
  }, include: { items: true, customer: true } });
  let invoice: Invoice | null = null;
  if (opts.invoice) {
    invoice = await db.invoice.create({ data: {
      invoiceNumber: `INV-UAT-${key}`, salesOrderId: order.id, customerId: customer.id,
      issueDate: new Date("2026-10-01T03:00:00Z"),
      dueDate: new Date(opts.overdue ? "2026-10-08T03:00:00Z" : "2026-11-01T03:00:00Z"),
      totalAmount: 5_000_000, paidAmount: opts.partial ? 2_000_000 : 0, remainingAmount: opts.partial ? 3_000_000 : 5_000_000,
      netSalesAmount: 5_000_000, paymentTermType: "CREDIT", creditTermWeeks: 1,
      status: opts.partial ? "Partial" : "Unpaid", ...buildInvoiceSnapshot(order)
    } });
    if (opts.partial) await db.payment.create({ data: { invoiceId: invoice.id, paymentDate: new Date("2026-10-10T03:00:00Z"),
      amount: 2_000_000, paymentMethod: "BankTransfer", notes: "Pembayaran awal fiktif untuk prasyarat UAT" } });
  }
  checkpoint("fixture-ready", { customer: customer.companyName, orderNumber: order.orderNumber,
    invoiceNumber: invoice?.invoiceNumber, fixtureSetupIsNotTestedAction: true });
  return { customer, order, invoice: invoice! };
}

test("A1 pelanggan baru tersimpan dan ditemukan kembali", async ({ page }) => {
  started = Date.now();
  await page.goto("/customers");
  await page.getByRole("link", { name: "Add Customer", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('input[name="companyName"]') });
  const values = { name: "Ibu Rina UT-01", companyName: "PT Pelanggan Baru UAT UT-01", phone: "081234567891",
    email: "rina.uat@example.test", address: "Jl. Uji Pelanggan 1, Jakarta", customerSegment: "Retail", notes: "Pelanggan simulasi UAT A1" };
  for (const [name, value] of Object.entries(values)) await form.locator(`[name="${name}"]`).fill(value);
  await submit(page, form.getByRole("button", { name: "Add Customer", exact: true }));
  await expect.poll(() => db.customer.count({ where: { companyName: values.companyName } })).toBe(1);
  const saved = await db.customer.findFirstOrThrow({ where: { companyName: values.companyName } });
  expect(saved).toMatchObject({ ...values, notes: expect.stringContaining(values.notes) });
  checkpoint("customer-saved", { customerId: saved.id, ...values });
  await page.goto("/customers");
  await page.locator('input[name="q"]').fill("UT-01");
  await page.locator('input[name="q"]').press("Enter");
  const row = page.getByRole("row").filter({ hasText: values.companyName });
  await expect(row).toHaveCount(1);
  await row.locator(`a[href="/customers?view=${saved.id}"]`).first().click();
  await expect(page.getByRole("heading", { name: values.companyName, exact: true })).toBeVisible();
  await expect(page.locator("body")).toContainText(values.phone);
  await shot(page, "customer-found");
});

test("A2 Admin membuat invoice dari pesanan Sales lalu membuka cetak", async ({ page }) => {
  const { order, customer } = await fixture("A2");
  started = Date.now();
  await page.goto(`/sales-orders/${order.id}`);
  await submit(page, page.getByRole("button", { name: "Generate Invoice", exact: true }).first());
  await expect.poll(() => db.invoice.count({ where: { salesOrderId: order.id } })).toBe(1);
  const invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: order.id } });
  expect(invoice).toMatchObject({ totalAmount: 5_000_000, remainingAmount: 5_000_000, customerCompanySnapshot: customer.companyName });
  expect(invoice.dueDate).toEqual(getDueDateForPaymentTerm({ issueDate: invoice.issueDate, paymentTermType: "CREDIT", creditTermWeeks: 1, creditTermMonths: null }));
  checkpoint("invoice-created", { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, total: invoice.totalAmount,
    dueDate: formatDate(invoice.dueDate), terms: "Credit 1 week", createdByAdminFromConfirmedSalesFixture: true });
  await page.goto(`/invoices?view=${invoice.id}`);
  await expect(page.locator("body")).toContainText(formatCurrency(5_000_000));
  await expect(page.locator("body")).toContainText(formatDate(invoice.dueDate));
  await shot(page, "invoice-verified");
  await page.getByRole("link", { name: "Cetak Invoice", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}/print$`));
  await expect(page.locator("body")).toContainText(customer.companyName);
  await expect(page.locator("body")).toContainText(order.orderNumber);
  await expect(page.locator("body")).toContainText(formatInvoiceCurrency(5_000_000));
  await shot(page, "invoice-print");
});

async function pay(page: Page, invoice: Invoice, amount: number, note: string) {
  await page.goto(`/payments?invoiceId=${invoice.id}`);
  const form = page.locator("form#record-payment");
  await form.locator('select[name="invoiceId"]').selectOption(invoice.id);
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.locator('input[name="paymentDate"]').fill("2026-10-15");
  await form.locator('select[name="paymentMethod"]').selectOption("BankTransfer");
  await form.locator('input[name="notes"]').fill(note);
  await submit(page, form.getByRole("button", { name: "Record Payment", exact: true }));
}

test("A3 transfer Rp2 juta dari invoice Rp5 juta dan riwayat", async ({ page }) => {
  const { invoice } = await fixture("A3", { invoice: true });
  started = Date.now();
  await pay(page, invoice, 2_000_000, "Bukti transfer fiktif UAT-TRF-A3-001; Rp2.000.000; 15-10-2026");
  await expect.poll(async () => (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).remainingAmount).toBe(3_000_000);
  const saved = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
  expect(saved).toMatchObject({ paidAmount: 2_000_000, remainingAmount: 3_000_000, status: "Partial" });
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({ amount: 2_000_000, paymentMethod: "BankTransfer" });
  checkpoint("partial-payment-saved", { paid: saved.paidAmount, remaining: saved.remainingAmount, status: saved.status,
    reference: "UAT-TRF-A3-001", paymentId: saved.payments[0].id,
    evidenceLimitation: "Payment proof used as simulated reference in notes; app has no payment-proof upload field" });
  await page.goto(`/invoices?view=${invoice.id}`);
  await expect(page.locator("body")).toContainText(formatCurrency(3_000_000));
  await expect(page.locator("body")).toContainText("Partial");
  await shot(page, "balance");
  await page.goto(`/payments?q=${invoice.invoiceNumber}`);
  await expect(page.getByRole("row").filter({ hasText: "UAT-TRF-A3-001" })).toContainText(formatCurrency(2_000_000));
  await shot(page, "history");
});

test("A4 packing lengkap PIC dan Surat Jalan resmi siap cetak", async ({ page }) => {
  const { order, customer } = await fixture("A4", { invoice: true });
  started = Date.now();
  await page.goto("/pick-pack?mode=create");
  const form = page.locator("form").filter({ has: page.locator('select[name="salesOrderId"]') });
  await form.locator('select[name="salesOrderId"]').selectOption(order.id);
  await form.locator('input[name="pickerName"]').fill("Pak Gudang UAT");
  await submit(page, form.getByRole("button", { name: "Create Picking List", exact: true }));
  await expect.poll(() => db.pickingList.count({ where: { salesOrderId: order.id } })).toBe(1);
  const pick = await db.pickingList.findUniqueOrThrow({ where: { salesOrderId: order.id } });
  checkpoint("picking-created", { pickingListId: pick.id });
  await page.goto(`/pick-pack?tab=active&view=${pick.id}`);
  await submit(page, page.getByRole("button", { name: "Lanjut ke Pack", exact: true }));
  await page.goto(`/pick-pack?tab=active&view=${pick.id}`);
  await expect(page.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true })).toBeDisabled();
  const checks = page.locator('input[name="checkedItemId"]');
  await expect(checks).toHaveCount(1);
  for (const check of await checks.all()) await check.check();
  await submit(page, page.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true }));
  await expect.poll(async () => (await db.pickingList.findUniqueOrThrow({ where: { id: pick.id } })).status).toBe("Packed");
  const packed = await db.pickingList.findUniqueOrThrow({ where: { id: pick.id }, include: { items: true } });
  expect(packed.pickerName).toBe("Pak Gudang UAT");
  expect(packed.items.every(item => item.isChecked && item.packedQuantity === item.orderedQuantity)).toBe(true);
  checkpoint("packing-complete", { picking: packed, allItemsChecked: true });
  await page.goto(`/pick-pack?tab=done&view=${pick.id}`);
  await shot(page, "packed");
  await page.goto("/surat-jalan?mode=create");
  await page.getByRole("combobox", { name: "Customer / delivery destination", exact: true }).selectOption({ label: `${customer.companyName} — ${customer.address}` });
  for (const all of await page.getByRole("button", { name: "Select all ready items", exact: true }).all()) await all.click();
  await page.locator('select[name="deliveryAssignmentId"]').selectOption("budi-b1234");
  await submit(page, page.getByRole("button", { name: "Create Draft Surat Jalan", exact: true }));
  const where = { OR: [{ salesOrderId: order.id }, { sources: { some: { salesOrderId: order.id } } }] };
  await expect.poll(() => db.deliveryNote.count({ where })).toBe(1);
  const note = await db.deliveryNote.findFirstOrThrow({ where });
  checkpoint("delivery-draft-saved", { deliveryNoteId: note.id, number: note.deliveryNoteNumber });
  await page.goto(`/surat-jalan?view=${note.id}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Kirim Surat Jalan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kirim Surat Jalan?", exact: true })).toBeVisible();
  await submit(page, page.getByRole("button", { name: "Ya, Kirim & Kunci", exact: true }));
  await expect.poll(async () => (await db.deliveryNote.findUniqueOrThrow({ where: { id: note.id } })).status).toBe("Issued");
  const issued = await db.deliveryNote.findUniqueOrThrow({ where: { id: note.id }, include: { items: true } });
  expect(issued.driverName).toBeTruthy(); expect(issued.vehiclePlateNumber).toBeTruthy(); expect(issued.issuedBy).toBeTruthy();
  expect(issued.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(100);
  checkpoint("delivery-issued", { number: issued.deliveryNoteNumber, status: issued.status, driver: issued.driverName,
    plate: issued.vehiclePlateNumber, issuedBy: issued.issuedBy, quantity: 100 });
  await page.goto(`/surat-jalan/${note.id}/print`);
  await expect(page.locator("body")).toContainText(order.orderNumber);
  await expect(page.locator("body")).toContainText(customer.companyName);
  await expect(page.locator("body")).toContainText(issued.driverName!);
  await shot(page, "surat-jalan-print");
});

test("A5 overdue collection Planned lalu Done dengan janji bayar", async ({ page }) => {
  const { customer, invoice } = await fixture("A5", { invoice: true, partial: true, overdue: true });
  started = Date.now();
  await page.goto(`/receivables?status=Overdue&q=${invoice.invoiceNumber}`);
  const row = page.getByRole("row").filter({ hasText: invoice.invoiceNumber });
  await expect(row).toContainText("Overdue");
  await expect(row).toContainText(formatCurrency(3_000_000));
  await shot(page, "overdue-found");
  await row.getByRole("link", { name: "Create Collection Task", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('select[name="customerId"]') });
  await form.locator('select[name="customerId"]').selectOption(customer.id);
  await form.locator('select[name="invoiceId"]').selectOption(invoice.id);
  await form.locator('input[name="scheduledDate"]').fill("2026-10-15");
  await form.locator('input[name="notes"]').fill("Hubungi pelanggan via telepon untuk sisa Rp3.000.000");
  await submit(page, form.getByRole("button", { name: "Add Collection Task", exact: true }));
  await expect.poll(() => db.collectionTask.count({ where: { invoiceId: invoice.id } })).toBe(1);
  const task = await db.collectionTask.findFirstOrThrow({ where: { invoiceId: invoice.id } });
  expect(task.status).toBe("Planned");
  checkpoint("collection-planned", { taskId: task.id, status: task.status, remaining: 3_000_000 });
  await page.goto(`/collections?view=${task.id}`);
  await shot(page, "planned");
  const edit = page.locator("form").filter({ has: page.locator(`input[name="taskId"][value="${task.id}"]`) });
  await edit.locator('input[name="notes"]').fill("SIMULASI: Pelanggan dihubungi 15 Oktober 2026 dan berjanji membayar Rp3.000.000 pada 20 Oktober 2026.");
  await edit.locator('select[name="status"]').selectOption("Done");
  await edit.locator('input[name="confirmationNote"]').fill("Kontak penagihan selesai; janji bayar 20 Oktober 2026. Pembayaran belum diterima.");
  await submit(page, edit.getByRole("button", { name: "Save Changes", exact: true }));
  await expect.poll(async () => (await db.collectionTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("Done");
  const done = await db.collectionTask.findUniqueOrThrow({ where: { id: task.id } });
  expect(done.notes).toContain("20 Oktober 2026");
  const audits = await db.auditTrail.findMany({ where: { entityId: task.id } });
  expect(JSON.stringify(audits)).toContain("Pembayaran belum diterima");
  const unpaid = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  expect(unpaid.remainingAmount).toBe(3_000_000);
  checkpoint("collection-done", { task: done, audit: audits, remaining: unpaid.remainingAmount,
    explanation: "Task Done = kontak selesai. Janji bayar bukan pembayaran; invoice tetap Overdue Rp3.000.000." });
  await page.goto(`/collections?tab=done&view=${task.id}`);
  await expect(page.locator("body")).toContainText("20 Oktober 2026");
  await shot(page, "done");
  await page.goto(`/invoices?view=${invoice.id}`);
  await expect(page.locator("body")).toContainText("Overdue");
  await expect(page.locator("body")).toContainText(formatCurrency(3_000_000));
  await shot(page, "invoice-still-overdue");
});

test("A6 pelunasan sisa Rp3 juta dan verifikasi saldo nol Paid", async ({ page }) => {
  const { invoice } = await fixture("A6", { invoice: true, partial: true });
  started = Date.now();
  await pay(page, invoice, 3_000_000, "Pelunasan fiktif UAT-TRF-A6-001 untuk seluruh sisa tagihan");
  await expect.poll(async () => (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("Paid");
  const paid = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
  expect(paid).toMatchObject({ paidAmount: 5_000_000, remainingAmount: 0, status: "Paid" });
  expect(paid.payments).toHaveLength(2);
  expect(paid.payments.reduce((sum, item) => sum + item.amount, 0)).toBe(5_000_000);
  checkpoint("settled", { total: paid.totalAmount, paid: paid.paidAmount, remaining: 0, status: paid.status, payments: paid.payments });
  await page.goto("/invoices?tab=done");
  const row = page.getByRole("row").filter({ hasText: invoice.invoiceNumber });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Paid");
  await expect(row.getByRole("cell").nth(8)).toHaveText(formatCurrency(0));
  await shot(page, "paid-zero");
  await page.goto(`/receivables?q=${invoice.invoiceNumber}`);
  await expect(page.getByRole("row").filter({ hasText: invoice.invoiceNumber })).toHaveCount(0);
  await shot(page, "no-active-receivable");
});

test("A7 tambah produk lalu ubah biaya dan catatan tanpa duplikat", async ({ page }) => {
  started = Date.now();
  await page.goto("/products");
  await page.getByRole("link", { name: "Add Product", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('input[name="productName"]') });
  await form.locator('input[name="productName"]').fill("Kain Uji UT-01");
  await form.locator('input[name="sku"]').fill("UAT-UT-01");
  await form.locator('input[name="listPrice"]').fill("30000");
  await form.locator('select[name="status"]').selectOption("Active");
  await submit(page, form.getByRole("button", { name: "Add Product", exact: true }));
  await expect.poll(() => db.product.count({ where: { sku: "UAT-UT-01" } })).toBe(1);
  const initial = await db.product.findUniqueOrThrow({ where: { sku: "UAT-UT-01" } });
  expect(initial).toMatchObject({ listPrice: 30000, status: "Active" });
  checkpoint("product-created", { productId: initial.id, cost: initial.listPrice, sku: initial.sku });
  await page.goto(`/products?view=${initial.id}`);
  await page.getByRole("link", { name: "Edit Product", exact: true }).first().click();
  const edit = page.locator("form").filter({ has: page.locator(`input[name="id"][value="${initial.id}"]`) });
  await edit.locator('input[name="listPrice"]').fill("32000");
  await edit.locator('textarea[name="notes"]').fill("Biaya diperbarui");
  await submit(page, edit.getByRole("button", { name: "Save Product", exact: true }));
  await expect.poll(async () => (await db.product.findUniqueOrThrow({ where: { id: initial.id } })).listPrice).toBe(32000);
  const updated = await db.product.findUniqueOrThrow({ where: { id: initial.id }, include: { costHistory: true } });
  expect(updated).toMatchObject({ id: initial.id, listPrice: 32000, notes: expect.stringContaining("Biaya diperbarui"), status: "Active" });
  expect(await db.product.count({ where: { productName: "Kain Uji UT-01" } })).toBe(1);
  expect(await db.product.count({ where: { sku: "UAT-UT-01" } })).toBe(1);
  checkpoint("same-product-updated", { productId: updated.id, cost: updated.listPrice, notes: updated.notes,
    duplicates: 0, costHistory: updated.costHistory });
  await page.goto(`/products?view=${initial.id}`);
  await expect(page.locator("body")).toContainText(formatCurrency(32000));
  await expect(page.locator("body")).toContainText("Biaya diperbarui");
  await shot(page, "updated-product");
});
