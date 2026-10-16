import { PrismaClient, type User, type Product, type Customer, type SalesOrder, type Invoice, type PickingList } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";
import { formatCurrency, formatInvoiceCurrency, formatDate } from "../src/lib/format";
import { toBusinessDateInputWib } from "../src/lib/business-clock";
import { buildInvoiceSnapshot, parseInvoiceItemSnapshots } from "../src/lib/invoice-snapshot";

const db = new PrismaClient();
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-flow-a-2026-10-15";
const password = "UAT-Flow-A-Simulation-Only-123!";
const users: Record<string, User> = {};
const products: Product[] = [];
let customer: Customer, order: SalesOrder, invoice: Invoice, pick: PickingList;
type Step = { no: number; title: string; role: string; status: string; started: string; seconds?: number;
  checkpoints: Record<string, unknown>[]; error?: string; findings: Record<string, unknown>[] };
const steps: Step[] = [];
let current: Step;
const runtimeErrors: string[] = [];
const save = () => writeFileSync(`${out}/${current?.no === 11 ? "print-route-evidence" : "flow-evidence"}.json`, JSON.stringify({
  scope: "P + SO Immediate Payment, steps 1-10, real browser role logins, isolated test schema",
  method: "Prerequisites only are seeded. Products, order, revisions, invoice, payments and Pick/Pack are created through UI.",
  assumptions: { productA: { cost: 70000, base: 100000, markupPercent: 5, final: 105000, initialQty: 10 },
    productB: { cost: 140000, base: 250000, discountPercent: 20, final: 200000, initialQty: 2 }, customerNpwp: null },
  steps, runtimeErrors
}, null, 2));
function checkpoint(name: string, values: Record<string, unknown> = {}) { current.checkpoints.push({ name, ...values }); save(); }
async function shot(page: Page, name: string) {
  const screenshot = `${out}/${String(current.no).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  checkpoint(name, { screenshot, url: page.url() });
}
async function runStep(page: Page, no: number, role: string, title: string, task: () => Promise<void>) {
  current = { no, role, title, status: "running", started: new Date().toISOString(), checkpoints: [], findings: [] };
  steps.push(current); save(); const start = Date.now();
  try { await task(); current.status = current.findings.length ? "passed_with_findings" : "passed"; }
  catch (error) { current.status = "failed"; current.error = error instanceof Error ? error.message : String(error);
    try { await shot(page, "failure"); writeFileSync(`${out}/${no}-failure-body.txt`, await page.locator("body").innerText()); } catch { /* preserve original */ }
  } finally { current.seconds = Math.round((Date.now() - start) / 100) / 10; save(); }
  console.log(`Step ${no}: ${current.status} (${current.seconds}s) ${title}${current.error ? `: ${current.error.slice(0, 350)}` : ""}`);
}
async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/");
  await page.waitForLoadState("networkidle");
}
async function submit(page: Page, button: Locator, note = "Simulasi UAT Alur A") {
  await page.waitForLoadState("networkidle");
  const response = page.waitForResponse(r => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]), { timeout: 60_000 });
  await button.click();
  const dialog = page.getByRole("dialog", { name: /^Confirm / });
  const mode = await Promise.race([dialog.waitFor({ state: "visible", timeout: 5_000 }).then(() => "confirm").catch(() => "none"), response.then(() => "sent")]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill(note);
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  }
  const result = await response;
  expect(result.status()).toBeLessThan(400);
  await expect(dialog).toBeHidden(); await page.waitForLoadState("networkidle");
}
async function revise(page: Page, quantity: number, note: string) {
  await page.goto(`/sales-orders/${order.id}`);
  const editor = page.locator(`[data-order-item-editor="${order.id}"]`);
  await expect(editor.getByRole("button", { name: "Edit Barang", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Edit Barang", exact: true }).click();
  const productAIndex = (await editor.getByRole("combobox").all()).length === 2 &&
    (await editor.getByRole("combobox").nth(0).inputValue()) === products[0].id ? 0 : 1;
  await editor.getByRole("spinbutton", { name: `Qty ${productAIndex + 1}`, exact: true }).fill(String(quantity));
  await editor.getByRole("button", { name: "Simpan Perubahan", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(formatCurrency(quantity * 105000 + 400000));
  await expect(dialog.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  await shot(page, "revision-confirmation");
  await dialog.getByRole("textbox").fill(note);
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(editor).toContainText("Perubahan barang tersimpan");
  await expect(editor.getByRole("button", { name: "Edit Barang", exact: true })).toBeEnabled();
  order = await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
  const items = await db.salesOrderItem.findMany({ where: { salesOrderId: order.id } });
  expect(items.find(i => i.productId === products[0].id)).toMatchObject({ quantity, finalUnitPrice: 105000, baseUnitPrice: 100000, markupPercent: 5 });
  expect(items.find(i => i.productId === products[1].id)).toMatchObject({ quantity: 2, finalUnitPrice: 200000, baseUnitPrice: 250000, discountPercent: 20 });
  expect(order.total).toBe(quantity * 105000 + 400000);
  const audits = await db.auditTrail.findMany({ where: { entityId: order.id } });
  expect(JSON.stringify(audits)).toContain(note);
  checkpoint("revision-saved", { order, items, audits });
  await shot(page, "revision-saved");
}
async function payment(page: Page, role: string, amount: number, note: string) {
  await login(page, role); await page.goto(`/payments?invoiceId=${invoice.id}`);
  const form = page.locator("form#record-payment");
  await form.locator('select[name="invoiceId"]').selectOption(invoice.id);
  await form.locator('input[name="paymentDate"]').fill(toBusinessDateInputWib(new Date()));
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.locator('select[name="paymentMethod"]').selectOption("BankTransfer");
  await form.locator('input[name="notes"]').fill(note);
  await submit(page, form.getByRole("button", { name: "Record Payment", exact: true }), note);
}

test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Isolated runner required");
  const [scope] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(schema);
  for (const role of ["ADMIN", "SALES", "MANAGER"] as const) {
    users[role] = await db.user.upsert({ where: { username: `uat_flow_a_${role.toLowerCase()}` }, update: {},
      create: { username: `uat_flow_a_${role.toLowerCase()}`, displayName: `UAT Alur A ${role}`, role, passwordHash: hashPassword(password) } });
  }
  customer = await db.customer.create({ data: { name: "Ibu Rina UAT Alur A", companyName: "PT Pelanggan A UAT",
    phone: "081234567890", email: "alur-a@example.test", address: "Jl. Simulasi Alur A 15, Jakarta",
    customerSegment: "Retail", portfolioOwnerUserId: users.SALES.id, npwp: null, notes: "Pelanggan fiktif UAT; tanpa NPWP dan tanpa transaksi sebelumnya" } });
  expect(await db.invoice.count({ where: { customerId: customer.id } })).toBe(0);
});
test.afterAll(async () => db.$disconnect());

test("Alur A 1-10 persiapan produk SO revisi invoice pembayaran Pick dan Pack", async ({ page }) => {
  page.on("pageerror", error => { runtimeErrors.push(error.message); save(); });
  await runStep(page, 1, "Admin", "Produk A/B Active tersimpan dan tersedia di SO dan PO", async () => {
    await login(page, "ADMIN");
    for (const [index, name, cost] of [[0, "Produk A UAT", 70000], [1, "Produk B UAT", 140000]] as const) {
      await page.goto("/products"); await page.getByRole("link", { name: "Add Product", exact: true }).click();
      const form = page.locator("form").filter({ has: page.locator('input[name="productName"]') });
      await form.locator('input[name="productName"]').fill(name);
      await form.locator('input[name="sku"]').fill(`UAT-FLOW-A-${index + 1}`);
      await form.locator('input[name="listPrice"]').fill(String(cost));
      await form.locator('select[name="status"]').selectOption("Active");
      await submit(page, form.getByRole("button", { name: "Add Product", exact: true }));
      products[index] = await db.product.findUniqueOrThrow({ where: { sku: `UAT-FLOW-A-${index + 1}` } });
      expect(products[index]).toMatchObject({ listPrice: cost, status: "Active" });
    }
    await shot(page, "products-saved"); await login(page, "SALES");
    for (const route of ["sales-orders", "customer-purchase-orders"]) {
      await page.goto(`/${route}?mode=create`);
      const options = await page.getByRole("combobox", { name: "Product Name", exact: true }).first().locator("option").allTextContents();
      expect(options).toContain("Produk A UAT"); expect(options).toContain("Produk B UAT");
      checkpoint("products-available", { route, options });
    }
  });
  await runStep(page, 2, "Sales", "SO-A Rp1.450.000 Confirmed NotRequired tanpa invoice", async () => {
    await login(page, "SALES"); await page.goto("/sales-orders?mode=create");
    const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
    await form.locator('select[name="customerId"]').selectOption(customer.id);
    await expect(form).toContainText("No PPN for this order");
    await form.locator('select[name="paymentTermType"]').selectOption("IMMEDIATE");
    await form.locator('input[name="notes"]').fill("SO-A UAT pembayaran langsung");
    for (let i = 0; i < 2; i++) {
      if (i) await form.getByRole("button", { name: "Add Item", exact: true }).click();
      await form.getByRole("combobox", { name: "Product Name", exact: true }).nth(i).selectOption(products[i].id);
      await form.getByRole("spinbutton", { name: "Qty", exact: true }).nth(i).fill(i ? "2" : "10");
      await form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).nth(i).fill(i ? "250000" : "100000");
      await form.getByRole("spinbutton", { name: "Markup (%)", exact: true }).nth(i).fill(i ? "0" : "5");
      await form.getByRole("spinbutton", { name: "Discount (%)", exact: true }).nth(i).fill(i ? "20" : "0");
    }
    await expect(form).toContainText(formatCurrency(1450000)); await shot(page, "so-form");
    await submit(page, form.getByRole("button", { name: "Create Sales Order", exact: true }));
    const saved = await db.salesOrder.findFirstOrThrow({ where: { customerId: customer.id }, include: { items: true, invoice: true } });
    order = saved;
    expect(saved).toMatchObject({ total: 1450000, status: "Confirmed", approvalStatus: "NotRequired", paymentTermType: "IMMEDIATE", ppnApplied: false, ppnAmount: 0, invoice: null });
    expect(saved.items).toHaveLength(2); checkpoint("order-saved", { order: saved });
    await page.goto(`/sales-orders/${order.id}`); await shot(page, "so-created");
  });
  await runStep(page, 3, "Sales", "Revisi kuantitas A12 B2 harga tetap total Rp1.660.000", async () => {
    await login(page, "SALES"); await revise(page, 12, "UAT A3: pelanggan menambah Produk A dari 10 menjadi 12 sebelum invoice");
    expect(await db.invoice.count({ where: { salesOrderId: order.id } })).toBe(0);
  });
  await runStep(page, 4, "Admin", "Detail terbaru dan rekap Excel ringkasan/rincian Rp1.660.000 sesuai tanggal", async () => {
    await login(page, "ADMIN"); await page.goto(`/sales-orders/${order.id}`);
    await expect(page.locator("body")).toContainText(formatCurrency(1660000)); await shot(page, "admin-detail");
    await page.goto(`/sales-orders?q=${order.orderNumber}`);
    await page.getByRole("button", { name: "Ekspor Excel Sales Order", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Ekspor Excel Sales Order", exact: true });
    const date = toBusinessDateInputWib(order.orderDate);
    await dialog.getByLabel("End Date", { exact: true }).fill(date);
    await dialog.getByLabel("Start Date", { exact: true }).fill(date);
    await shot(page, "export-date-range");
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Ekspor Excel", exact: true }).click()]);
    const file = `${out}/${download.suggestedFilename()}`; await download.saveAs(file);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
    const summary = workbook.getWorksheet("Sales Orders")!; const lines = workbook.getWorksheet("Sales Order Items")!;
    const summaryRows = summary.getRows(6, summary.rowCount - 5)!; const lineRows = lines.getRows(6, lines.rowCount - 5)!;
    expect(summaryRows).toHaveLength(1); expect(summaryRows[0].getCell(1).value).toBe(order.orderNumber);
    expect(summaryRows[0].getCell(9).value).toBe(1660000); expect(lineRows).toHaveLength(2);
    expect(lineRows.reduce((sum, row) => sum + Number(row.getCell(11).value), 0)).toBe(1660000);
    expect(lineRows.map(r => Number(r.getCell(6).value)).sort((a,b) => a-b)).toEqual([2,12]);
    const query = new URLSearchParams({ startDate: "2026-01-01", endDate: "2026-01-02", source: "DIRECT", tab: "ongoing", q: order.orderNumber });
    const excluded = await page.request.get(`/api/sales-orders/export?${query}`);
    expect(excluded.ok()).toBeTruthy(); const empty = new ExcelJS.Workbook(); await empty.xlsx.load(await excluded.body() as never);
    expect(empty.getWorksheet("Sales Orders")!.rowCount).toBe(5);
    checkpoint("excel-verified", { file, date, summaryRows: summaryRows.map(r => r.values), itemRows: lineRows.map(r => r.values), excludedRangeRows: 0 });
  });
  await runStep(page, 5, "Admin", "INV-A Rp1.660.000 Unpaid dan jatuh tempo hari terbit", async () => {
    await login(page, "ADMIN"); await page.goto(`/sales-orders/${order.id}`);
    await submit(page, page.getByRole("button", { name: "Generate Invoice", exact: true }).first());
    invoice = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: order.id } });
    expect(invoice).toMatchObject({ totalAmount: 1660000, paidAmount: 0, remainingAmount: 1660000, status: "Unpaid", paymentTermType: "IMMEDIATE", ppnApplied: false, ppnAmount: 0 });
    expect(toBusinessDateInputWib(invoice.dueDate)).toBe(toBusinessDateInputWib(invoice.issueDate));
    const snapshots = parseInvoiceItemSnapshots(invoice.itemsSnapshot); expect(snapshots).toHaveLength(2);
    expect(snapshots.map(i => i.quantity).sort((a,b) => a-b)).toEqual([2,12]);
    checkpoint("invoice-created", { invoice, snapshots });
    await page.goto(`/invoices?view=${invoice.id}`); await expect(page.locator("body")).toContainText("Unpaid");
    await expect(page.locator("body")).toContainText(formatDate(invoice.dueDate)); await shot(page, "invoice-issued");
  });
  await runStep(page, 6, "Admin", "Revisi A14 sebelum pembayaran/Pack/SJ menyelaraskan invoice yang sama Rp1.870.000", async () => {
    await login(page, "ADMIN"); const originalId = invoice.id;
    expect(await db.payment.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await db.pickingList.count({ where: { salesOrderId: order.id } })).toBe(0);
    await revise(page, 14, "UAT A6: penambahan Produk A menjadi 14 sebelum pembayaran dan penyiapan barang");
    const updated = await db.invoice.findUniqueOrThrow({ where: { salesOrderId: order.id } });
    expect(updated).toMatchObject({ id: originalId, totalAmount: 1870000, remainingAmount: 1870000, paidAmount: 0, status: "Unpaid" });
    expect(updated.revisionNumber).toBeGreaterThan(invoice.revisionNumber); expect(updated.dueDate).toEqual(invoice.dueDate);
    const items = parseInvoiceItemSnapshots(updated.itemsSnapshot);
    expect(items.find(i => i.itemName === "Produk A UAT")).toMatchObject({ quantity: 14, finalUnitPrice: 105000 });
    invoice = updated; checkpoint("same-invoice-revised", { invoice, items });
    await page.goto(`/invoices?view=${invoice.id}`); await expect(page.locator("body")).toContainText(formatCurrency(1870000));
    await shot(page, "invoice-synced");
  });
  await runStep(page, 7, "Admin + Sales", "Keterangan invoice disimpan dan Sales mencetak INV-A tanpa PPN", async () => {
    await login(page, "ADMIN"); await page.goto(`/invoices?view=${invoice.id}`);
    const notes = "UAT: Kirim barang setelah pembayaran lunas. Hubungi Ibu Rina sebelum pengiriman.";
    const form = page.locator("form").filter({ has: page.locator('textarea[name="notes"]') });
    await form.locator('textarea[name="notes"]').fill(notes);
    await submit(page, form.getByRole("button", { name: "Save Notes", exact: true }));
    invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }); expect(invoice.notes).toContain(notes);
    checkpoint("notes-stored", { entered: notes, stored: invoice.notes });
    await login(page, "SALES"); await page.goto(`/invoices?view=${invoice.id}`);
    await page.getByRole("link", { name: "Cetak Invoice", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoice.id}/print$`));
    const article = page.locator("article"); await expect(article).toContainText(notes);
    if ((await article.innerText()).includes("Confirmation note:")) {
      current.findings.push({ id: "FLOW-A-01", severity: "P2", title: "Catatan konfirmasi internal ikut tersimpan sebagai keterangan invoice dan tercetak untuk pelanggan",
        expected: notes, storedAndPrinted: invoice.notes }); save();
    }
    await expect(article).toContainText(formatInvoiceCurrency(1870000));
    await expect(article).toContainText(formatDate(invoice.dueDate));
    await expect(article).not.toContainText("NPWP:"); await expect(article.getByText(/^PPN \(/)).toHaveCount(0);
    const row = article.getByRole("row").filter({ hasText: "Produk A UAT" }); await expect(row).toContainText("14");
    await expect(row).toContainText(formatInvoiceCurrency(105000));
    await page.emulateMedia({ media: "print" }); await page.pdf({ path: `${out}/07-invoice-sales.pdf`, format: "A4", printBackground: true });
    await page.emulateMedia({ media: "screen" }); await shot(page, "invoice-sales-print");
    checkpoint("print-verified", { invoiceId: invoice.id, total: invoice.totalAmount, remaining: invoice.remainingAmount, due: formatDate(invoice.dueDate), ppn: invoice.ppnAmount, notes });
  });
  await runStep(page, 8, "Admin + Manager + Sales", "Admin Rp750.000 Manager Rp1.120.000 lalu Sales memverifikasi Paid saldo nol", async () => {
    await payment(page, "ADMIN", 750000, "UAT-TRF-A-001 Admin pembayaran pertama Rp750.000");
    let saved = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(saved).toMatchObject({ paidAmount: 750000, remainingAmount: 1120000, status: "Partial" });
    checkpoint("admin-partial", { invoice: saved }); await shot(page, "admin-partial-payment");
    await payment(page, "MANAGER", 1120000, "UAT-TRF-A-002 Manager pelunasan Rp1.120.000");
    saved = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(saved).toMatchObject({ paidAmount: 1870000, remainingAmount: 0, status: "Paid" });
    const payments = await db.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(payments).toHaveLength(2); expect(payments.map(p => p.amount).sort((a,b)=>a-b)).toEqual([750000,1120000]);
    const audits = await db.auditTrail.findMany({ where: { entityId: { in: payments.map(p => p.id) } } });
    checkpoint("settled", { invoice: saved, payments, audits });
    await login(page, "SALES"); await page.goto(`/payments?q=${invoice.invoiceNumber}`);
    await expect(page.getByRole("row").filter({ hasText: "UAT-TRF-A-001" })).toContainText(formatCurrency(750000));
    await expect(page.getByRole("row").filter({ hasText: "UAT-TRF-A-002" })).toContainText(formatCurrency(1120000));
    await shot(page, "sales-payment-history");
    await page.goto(`/invoices?tab=done&view=${invoice.id}`);
    await expect(page.locator("body")).toContainText("Paid"); await shot(page, "sales-paid-invoice");
    await page.goto(`/receivables?q=${invoice.invoiceNumber}`);
    await expect(page.getByRole("row").filter({ hasText: invoice.invoiceNumber })).toHaveCount(0);
    checkpoint("sales-paid-and-not-receivable", { paid: 1870000, remaining: 0, status: "Paid" });
  });
  await runStep(page, 9, "Admin + Sales", "PL-A dengan PIC A14 B2 dan cetak Sales tanpa harga", async () => {
    await login(page, "ADMIN"); await page.goto("/pick-pack");
    await page.getByRole("link", { name: "Add Picking List", exact: true }).click();
    const form = page.locator("form").filter({ has: page.locator('select[name="salesOrderId"]') });
    await form.locator('select[name="salesOrderId"]').selectOption(order.id);
    await form.locator('input[name="pickerName"]').fill("Bapak Dedi UAT");
    await submit(page, form.getByRole("button", { name: "Create Picking List", exact: true }));
    const created = await db.pickingList.findUniqueOrThrow({ where: { salesOrderId: order.id }, include: { items: true } });
    pick = created; expect(created).toMatchObject({ status: "Pending", pickerName: "Bapak Dedi UAT", usesChecklist: true });
    expect(created.items.map(i => i.orderedQuantity).sort((a,b)=>a-b)).toEqual([2,14]);
    checkpoint("pick-created", { pickingList: created });
    await login(page, "SALES"); await page.goto(`/pick-pack?view=${pick.id}`);
    await page.getByRole("link", { name: "Print Pick & Pack", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/pick-pack/${pick.id}/print$`));
    const article = page.locator("article"); await expect(article).toContainText("Bapak Dedi UAT");
    await expect(article.getByRole("row").filter({ hasText: "Produk A UAT" })).toContainText("14");
    await expect(article.getByRole("row").filter({ hasText: "Produk B UAT" })).toContainText("2");
    await expect(article).not.toContainText(/Rp|Price|Subtotal|1\.870\.000/);
    await page.emulateMedia({ media: "print" }); await page.pdf({ path: `${out}/09-pick-sales.pdf`, format: "A4", printBackground: true });
    await page.emulateMedia({ media: "screen" }); await shot(page, "pick-sales-print");
    checkpoint("pick-print-no-prices", { pickingListId: pick.id, pic: created.pickerName, pricesVisible: false });
  });
  await runStep(page, 10, "Admin", "Pack menyimpan sebagian progres lalu Completed dan siap Surat Jalan", async () => {
    await login(page, "ADMIN"); await page.goto(`/pick-pack?view=${pick.id}`);
    await submit(page, page.getByRole("button", { name: "Lanjut ke Pack", exact: true }));
    await page.goto(`/pick-pack?view=${pick.id}`);
    const form = page.locator("form").filter({ has: page.locator('input[name="pickerName"]') });
    await expect(form.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true })).toBeDisabled();
    const checks = form.locator('input[name="checkedItemId"]'); await expect(checks).toHaveCount(2);
    await checks.nth(0).check();
    await form.locator('textarea[name="notes"]').fill("UAT: Satu barang sudah diperiksa; barang kedua menunggu pemeriksaan.");
    await submit(page, form.getByRole("button", { name: "Save Progress", exact: true }));
    let saved = await db.pickingList.findUniqueOrThrow({ where: { id: pick.id }, include: { items: true } });
    expect(saved.status).toBe("InProgress"); expect(saved.items.filter(i=>i.isChecked)).toHaveLength(1);
    checkpoint("partial-progress-saved", { pickingList: saved });
    await page.goto(`/pick-pack?view=${pick.id}`);
    const resumed = page.locator("form").filter({ has: page.locator('input[name="pickerName"]') });
    await expect(resumed.locator('input[name="checkedItemId"]:checked')).toHaveCount(1);
    await expect(resumed.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true })).toBeDisabled();
    await shot(page, "partial-progress-persisted");
    for (const check of await resumed.locator('input[name="checkedItemId"]').all()) await check.check();
    await resumed.locator('input[name="pickerName"]').fill("");
    await expect(resumed.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true })).toBeDisabled();
    await resumed.locator('input[name="pickerName"]').fill("Bapak Dedi UAT");
    await resumed.locator('textarea[name="notes"]').fill("UAT: Semua barang diperiksa, siap Surat Jalan.");
    await expect(resumed.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true })).toBeEnabled();
    await submit(page, resumed.getByRole("button", { name: "Selesaikan Pick & Pack", exact: true }));
    saved = await db.pickingList.findUniqueOrThrow({ where: { id: pick.id }, include: { items: true } });
    expect(saved).toMatchObject({ status: "Packed", pickerName: "Bapak Dedi UAT", packedAt: expect.any(Date) });
    expect(saved.items.every(i=>i.isChecked && i.packedQuantity === i.orderedQuantity)).toBe(true);
    await page.goto(`/pick-pack?tab=completed&view=${pick.id}`);
    await expect(page.getByRole("heading", { name: pick.pickingListNumber, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Surat Jalan", exact: true })).toBeVisible();
    await shot(page, "completed-ready-delivery");
    await page.getByRole("link", { name: "Create Surat Jalan", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/surat-jalan\\?mode=create&pickingListId=${pick.id}`));
    await expect(page.locator("body")).toContainText(order.orderNumber);
    await expect(page.locator("body")).toContainText("Produk A UAT");
    checkpoint("ready-surat-jalan", { pickingList: saved, orderId: order.id, url: page.url(), deliveryNoteNotCreated: true });
    await shot(page, "ready-surat-jalan");
  });
  expect(steps.filter(step=>step.status === "failed").map(step=>`${step.no}: ${step.error}`)).toEqual([]);
  expect(steps.flatMap(step=>step.findings.map(finding=>`${step.no}: ${finding.id} ${finding.title}`))).toEqual([]);
});

test("Print-route pemeriksaan pencarian tabel pada salinan invoice dan Pick", async ({ page }) => {
  await runStep(page, 11, "Sales", "Reproduksi tambahan: pencarian baris pada halaman cetak", async () => {
    const fixtureOrder = await db.salesOrder.create({ data: {
      orderNumber: "SO-UAT-PRINT-ROUTE", customerId: customer.id, createdByUserId: users.SALES.id,
      orderDate: new Date(), status: "Invoiced", approvalStatus: "NotRequired", paymentTermType: "IMMEDIATE",
      total: 1870000, subtotal: 1870000, netSalesAmount: 1870000, deliveryDestinationSnapshot: customer.address,
      items: { create: [
        { itemName: "Produk A UAT", quantity: 14, baseUnitPrice: 100000, markupPercent: 5, finalUnitPrice: 105000, subtotal: 1470000 },
        { itemName: "Produk B UAT", quantity: 2, baseUnitPrice: 250000, discountPercent: 20, finalUnitPrice: 200000, subtotal: 400000 }
      ] }
    }, include: { customer: true, items: true } });
    const fixtureInvoice = await db.invoice.create({ data: {
      invoiceNumber: "INV-UAT-PRINT-ROUTE", salesOrderId: fixtureOrder.id, customerId: customer.id,
      issueDate: new Date(), dueDate: new Date(), totalAmount: 1870000, remainingAmount: 1870000, paidAmount: 0,
      netSalesAmount: 1870000, paymentTermType: "IMMEDIATE", status: "Unpaid", ...buildInvoiceSnapshot(fixtureOrder)
    } });
    const fixturePick = await db.pickingList.create({ data: {
      pickingListNumber: "PL-UAT-PRINT-ROUTE", salesOrderId: fixtureOrder.id, usesChecklist: true,
      pickerName: "Bapak Dedi UAT", items: { create: fixtureOrder.items.map(item=>({
        salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: item.quantity,
        availableQuantity: 0, packedQuantity: 0, availabilityStatus: "Unchecked"
      })) }
    } });
    checkpoint("print-prerequisite-fixtures", { invoiceId: fixtureInvoice.id, pickingListId: fixturePick.id,
      setupNotTestedBusinessAction: true });
    await login(page, "SALES");
    for (const kind of ["invoice", "pick"] as const) {
      let reproduced = false;
      for (let attempt = 1; attempt <= 3 && !reproduced; attempt++) {
        await page.goto(kind === "invoice" ? `/invoices?view=${fixtureInvoice.id}` : `/pick-pack?view=${fixturePick.id}`);
        await page.waitForLoadState("networkidle");
        await page.getByRole("link", { name: kind === "invoice" ? "Cetak Invoice" : "Print Pick & Pack", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/${kind === "invoice" ? `invoices/${fixtureInvoice.id}` : `pick-pack/${fixturePick.id}`}/print$`));
        await page.waitForLoadState("networkidle");
        const article = page.locator("article");
        const search = article.getByRole("searchbox", { name: "Search rows containing this text", exact: true });
        checkpoint("print-route-tools", { kind, attempt, searchCount: await search.count(), url: page.url() });
        if (!await search.count()) continue;
        await shot(page, `${kind}-unexpected-table-search`);
        await search.fill("Produk A UAT");
        await expect(article.getByRole("row").filter({ hasText: "Produk B UAT" })).toBeHidden();
        await page.emulateMedia({ media: "print" });
        const states = await article.locator("tbody tr").evaluateAll(rows => rows.map(row => ({
          text: row.textContent, hidden: (row as HTMLElement).hidden, display: getComputedStyle(row).display
        })));
        const visibleRows = states.filter(row=>row.display !== "none");
        checkpoint("print-media-filtered-rows", { kind, states, visibleRowCount: visibleRows.length, expectedRowCount: 2,
          invoiceTotalStillVisible: kind === "invoice" ? await article.innerText() : null });
        if (visibleRows.length !== 2) {
          current.findings.push({ id: "FLOW-A-02", severity: "P2", affected: kind,
            title: "Pencarian tabel terbawa ke halaman cetak dan menghilangkan barang dari hasil cetak",
            visibleRows: visibleRows.length, expectedRows: 2, totalStillFull: kind === "invoice" ? 1870000 : 16 });
          save();
        }
        await page.pdf({ path: `${out}/11-${kind}-filtered-print.pdf`, format: "A4", printBackground: true });
        await page.screenshot({ path: `${out}/11-${kind}-filtered-print-media.png`, fullPage: true });
        await page.emulateMedia({ media: "screen" });
        await shot(page, `${kind}-filtered-print`);
        reproduced = true;
      }
      checkpoint("print-reproduction-result", { kind, reproduced });
    }
  });
  expect(steps.filter(step=>step.status === "failed").map(step=>step.error)).toEqual([]);
  expect(steps.flatMap(step=>step.findings)).toEqual([]);
});
