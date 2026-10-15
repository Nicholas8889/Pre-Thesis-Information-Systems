import { PrismaClient, type User, type Product, type Customer } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot } from "../src/lib/invoice-snapshot";
import { formatCurrency } from "../src/lib/format";

const db = new PrismaClient();
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-sales-manager-2026-10-15";
const password = "UAT-Sales-Manager-Only-123!";
const users: Record<string, User> = {};
let products: Product[];
let started = 0;
type Evidence = { scenario: string; title: string; method: string; checkpoints: Record<string, unknown>[];
  findings: Record<string, unknown>[]; outcome?: string; runnerStatus?: string; durationSeconds?: number | null;
  errors?: (string | undefined)[] };
let evidence: Evidence;
function checkpoint(name: string, data: Record<string, unknown> = {}) {
  evidence.checkpoints.push({ ...data, name }); save();
}
function save() { writeFileSync(`${out}/${evidence.scenario}-evidence.json`, JSON.stringify(evidence, null, 2)); }
async function shot(page: Page, name: string) {
  const screenshot = `${out}/${evidence.scenario}-${name}.png`;
  await page.screenshot({ path: screenshot, fullPage: true }); checkpoint(name, { screenshot, url: page.url() });
}
async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/");
  await page.waitForLoadState("networkidle");
}
async function submit(page: Page, button: Locator, note = "Simulasi UAT Sales Manager") {
  await page.waitForLoadState("networkidle");
  const response = page.waitForResponse(r => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]), { timeout: 60_000 });
  await button.click();
  const dialog = page.getByRole("dialog", { name: /^Confirm / });
  const mode = await Promise.race([dialog.waitFor({ state: "visible", timeout: 5_000 }).then(() => "confirm").catch(() => "none"), response.then(() => "sent")]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill(note);
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  }
  await response; await expect(dialog).toBeHidden();
  await page.waitForLoadState("networkidle");
}
test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Isolated runner required");
  const [scope] = await db.$queryRaw<{schema: string}[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(schema);
  for (const role of ["SALES", "MANAGER", "ADMIN"] as const) users[role] = await db.user.upsert({
    where: { username: `uat_sm_${role.toLowerCase()}` }, update: {}, create: {
      username: `uat_sm_${role.toLowerCase()}`, displayName: `UAT ${role}`, role, passwordHash: hashPassword(password) } });
  products = await Promise.all([30000, 40000].map((cost, index) => db.product.upsert({
    where: { sku: `UAT-SM-${index + 1}` }, update: {}, create: { sku: `UAT-SM-${index + 1}`,
      productName: `Kain UAT ${index === 0 ? "Katun" : "Poliester"}`, listPrice: cost } })));
});
test.beforeEach(async ({}, info) => {
  evidence = { scenario: info.title.split(" ")[0], title: info.title,
    method: "Guided browser simulation, actual role login; setup excluded from timing", checkpoints: [], findings: [] }; started = 0;
});
test.afterEach(async ({ page }, info) => {
  evidence.runnerStatus = info.status; evidence.outcome ??= info.status === "passed" ? "Berhasil secara fungsional" : "Belum selesai";
  evidence.durationSeconds = started ? Math.round((Date.now() - started) / 100) / 10 : null;
  evidence.errors = info.errors.map(error => error.message);
  if (info.status !== "passed") { try { await shot(page, "failure"); } catch { /* Keep original error. */ } }
  save();
});
test.afterAll(async () => db.$disconnect());

async function customer(key: string) {
  return db.customer.create({ data: { name: `Ibu Rina ${key}`, companyName: `PT UAT ${key}`, phone: "081234567890",
    email: "uat@example.test", address: "Jl. Uji Sales Manager 15, Jakarta", customerSegment: "Retail", portfolioOwnerUserId: users.SALES.id } });
}
async function history(key: string, c: Customer, opts: { total?: number; paid?: number; month?: string; delivered?: boolean } = {}) {
  const total = opts.total ?? 5_000_000, paid = opts.paid ?? 2_000_000, date = new Date(`${opts.month ?? "2026-10"}-01T03:00:00Z`);
  const order = await db.salesOrder.create({ data: { orderNumber: `SO-UAT-${key}`, customerId: c.id, createdByUserId: users.SALES.id,
    orderDate: date, status: opts.delivered === false ? "Invoiced" : "Shipped", subtotal: total, total, netSalesAmount: total,
    deliveryDestinationSnapshot: c.address, paymentTermType: "CREDIT", creditTermWeeks: 1,
    items: { create: { itemName: products[0].productName, productId: products[0].id, quantity: 100,
      baseUnitPrice: total / 100, finalUnitPrice: total / 100, subtotal: total } } }, include: { customer: true, items: true } });
  const invoice = await db.invoice.create({ data: { invoiceNumber: `INV-UAT-${key}`, salesOrderId: order.id, customerId: c.id,
    issueDate: date, dueDate: new Date(date.getTime() + 7 * 86400000), totalAmount: total, paidAmount: paid, remainingAmount: total - paid,
    netSalesAmount: total, status: paid === total ? "Paid" : paid ? "Partial" : "Unpaid", paymentTermType: "CREDIT", creditTermWeeks: 1,
    ...buildInvoiceSnapshot(order) } });
  if (paid) await db.payment.create({ data: { invoiceId: invoice.id, paymentDate: new Date(date.getTime() + 2 * 86400000),
    amount: paid, paymentMethod: "BankTransfer", notes: "Pembayaran historis fiktif UAT" } });
  if (opts.delivered !== false) await db.deliveryNote.create({ data: { deliveryNoteNumber: `SJ-UAT-${key}`, customerId: c.id,
    invoiceId: invoice.id, salesOrderId: order.id, status: "Delivered", deliveryDate: date, recipientName: c.name,
    recipientPhone: c.phone, recipientAddress: c.address, receivedAt: date, receivedBy: "Penerima UAT", receiverName: "Penerima UAT" } });
  checkpoint("history-fixture", { order: order.orderNumber, invoice: invoice.invoiceNumber, total, paid, remaining: total - paid,
    delivered: opts.delivered !== false, month: opts.month ?? "2026-10", setupNotTestedAction: true });
  return { order, invoice };
}
async function createOrder(page: Page, c: Customer, note: string) {
  await page.goto("/sales-orders");
  await page.goto("/sales-orders?mode=create");
  const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
  await form.locator('select[name="customerId"]').selectOption(c.id);
  await form.getByRole("combobox", { name: "Product Name", exact: true }).first().selectOption(products[0].id);
  await form.getByRole("spinbutton", { name: "Qty", exact: true }).first().fill("10");
  await form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).first().fill("50000");
  await form.locator('select[name="paymentTermType"]').selectOption("CREDIT");
  await form.locator('select[name="creditTerm"]').selectOption("1w");
  await form.locator('[name="notes"]').fill(note);
  await submit(page, form.getByRole("button", { name: "Create Sales Order", exact: true }));
  return db.salesOrder.findFirstOrThrow({ where: { customerId: c.id, notes: { contains: note } }, include: { invoice: true }, orderBy: { createdAt: "desc" } });
}
async function inquiry(page: Page, c: Customer, key: string, agreed: boolean, keepCostDefault = false) {
  await page.goto("/customer-inquiries");
  await page.getByRole("link", { name: "Add Inquiry", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
  await form.locator('select[name="customerId"]').selectOption(c.id);
  await form.locator('input[name="neededBy"]').fill("2026-10-25");
  await form.locator('input[name="notes"]').fill(`Inquiry ${key}`);
  for (let i = 0; i < 2; i++) {
    if (i) await form.getByRole("button", { name: "Add Item", exact: true }).click();
    await form.getByRole("combobox", { name: "Product", exact: true }).nth(i).selectOption(products[i].id);
    const automaticAgreed = await form.getByRole("spinbutton", { name: "Agreed Unit Price", exact: true }).nth(i).inputValue();
    expect(automaticAgreed).toBe("");
    checkpoint("automatic-agreed-price", { item: i + 1, productionCost: products[i].listPrice, automaticAgreed, userHasNotEnteredAgreement: true });
    await form.getByRole("spinbutton", { name: "Qty", exact: true }).nth(i).fill(i ? "20" : "10");
    await form.getByRole("spinbutton", { name: "Requested Unit Price", exact: true }).nth(i).fill(i ? "75000" : "50000");
    if (!keepCostDefault) await form.getByRole("spinbutton", { name: "Agreed Unit Price", exact: true }).nth(i).fill(agreed ? i ? "70000" : "48000" : "");
  }
  await shot(page, "inquiry-form");
  await submit(page, form.getByRole("button", { name: "Create Customer Inquiry", exact: true }));
  const saved = await db.customerInquiry.findFirstOrThrow({ where: { customerId: c.id }, include: { items: true }, orderBy: { createdAt: "desc" } });
  expect(saved.items).toHaveLength(2); checkpoint("inquiry-saved", { inquiry: saved });
  await page.goto(`/customer-inquiries/${saved.id}`); await shot(page, "inquiry-saved");
  return saved;
}

test("S1 Sales menemukan pelanggan, riwayat dan kondisi pembayaran", async ({ page }) => {
  const c = await customer("S1"); const old = await history("S1", c);
  await history("S1-PAID", c, { total: 1_000_000, paid: 1_000_000, month: "2026-09" });
  await login(page, "SALES"); started = Date.now();
  await page.getByRole("link", { name: "Customers", exact: true }).first().click();
  await page.locator('input[name="q"]').fill(c.companyName); await page.locator('input[name="q"]').press("Enter");
  const row = page.getByRole("row").filter({ hasText: c.companyName });
  await row.locator(`a[href="/customers?view=${c.id}"]`).first().click();
  await expect(page.locator("body")).toContainText("Outstanding Payment");
  await expect(page.locator("body")).toContainText(formatCurrency(3_000_000));
  await expect(page.locator("body")).toContainText("SO-UAT-S1-PAID");
  await shot(page, "customer-history");
  await page.getByRole("link", { name: old.invoice.invoiceNumber, exact: true }).first().click();
  await expect(page.locator("body")).toContainText(formatCurrency(2_000_000));
  await expect(page.locator("body")).toContainText(formatCurrency(3_000_000));
  await expect(page.locator("body")).toContainText("Overdue");
  checkpoint("payment-explained", { total: 5_000_000, paid: 2_000_000, remaining: 3_000_000, effectiveStatus: "Overdue",
    explanation: "Riwayat satu transaksi lunas dan satu belum lunas; Outstanding berasal dari barang sudah diterima." });
  await shot(page, "invoice-evidence");
});

test("S2 inquiry disimpan dahulu lalu harga dinegosiasikan sebelum konversi", async ({ page }) => {
  const c = await customer("S2"); await login(page, "SALES"); started = Date.now();
  const saved = await inquiry(page, c, "S2", false);
  expect(saved.items.every(item => item.agreedUnitPrice === null)).toBe(true);
  await expect(page.getByRole("link", { name: "Convert to Sales Order", exact: true })).toHaveCount(0);
  const prices = page.locator('form').filter({ has: page.locator('input[name="expectedUpdatedAt"]') });
  await prices.locator('input[name="agreedUnitPrice"]').nth(0).fill("48000");
  await prices.locator('input[name="agreedUnitPrice"]').nth(1).fill("70000");
  await submit(page, prices.getByRole("button", { name: "Save Agreed Prices", exact: true }));
  const negotiated = await db.customerInquiry.findUniqueOrThrow({ where: { id: saved.id }, include: { items: true } });
  expect(negotiated.items.map(item => item.agreedUnitPrice).sort()).toEqual([48000, 70000]);
  await expect(page.getByRole("link", { name: "Convert to Sales Order", exact: true })).toBeVisible();
  checkpoint("negotiated-prices-saved", { inquiry: negotiated });
  await shot(page, "negotiated-prices-saved");
  await page.getByRole("link", { name: "Convert to Sales Order", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
  await expect(form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).first()).toBeVisible();
  checkpoint("conversion-before-negotiation", { prices: await form.getByRole("spinbutton", { name: "Base Unit Price", exact: true })
    .evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value)) });
  await expect(form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).nth(0)).toHaveValue("48000");
  await expect(form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).nth(0)).toHaveAttribute("readonly", "");
  await shot(page, "negotiated-price-entered");
  await submit(page, form.getByRole("button", { name: "Create Sales Order", exact: true }));
  const order = await db.salesOrder.findFirstOrThrow({ where: { customerId: c.id } });
  expect(order.total).toBe(1_880_000);
  expect(await db.salesOrder.count({ where: { customerId: c.id } })).toBe(1);
  checkpoint("negotiation-result", { order, duplicateOrders: 0 });
  await page.goto(`/sales-orders/${order.id}`);
  await shot(page, "conversion-result");
});

test("S2B kontrol konversi bila harga final sudah diisi sebelum inquiry disimpan", async ({ page }) => {
  const c = await customer("S2B"); await login(page, "SALES"); started = Date.now();
  const saved = await inquiry(page, c, "S2B", true);
  await page.getByRole("link", { name: "Convert to Sales Order", exact: true }).click();
  const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
  await expect(form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).nth(0)).toHaveValue("48000");
  await expect(form.getByRole("spinbutton", { name: "Base Unit Price", exact: true }).nth(1)).toHaveValue("70000");
  await submit(page, form.getByRole("button", { name: "Create Sales Order", exact: true }));
  const converted = await db.customerInquiry.findUniqueOrThrow({ where: { id: saved.id }, include: { salesOrder: { include: { items: true, invoice: true } } } });
  expect(converted.status).toBe("ConvertedToSO"); expect(converted.salesOrder?.total).toBe(1_880_000);
  expect(converted.salesOrder?.status).toBe("Confirmed");
  expect(converted.salesOrder?.invoice).toBeNull();
  checkpoint("conversion-succeeded", { inquiryStatus: converted.status, order: converted.salesOrder });
  await page.goto(`/sales-orders/${converted.salesOrder!.id}`);
  await shot(page, "converted-order");
});

test("S2C biaya produksi tidak menjadi harga kesepakatan dan konversi wajib menunggu harga", async ({ page }) => {
  const c = await customer("S2C"); await login(page, "SALES"); started = Date.now();
  const saved = await inquiry(page, c, "S2C", false, true);
  expect(saved.items.every(item => item.agreedUnitPrice === null)).toBe(true);
  await expect(page.getByRole("link", { name: "Convert to Sales Order", exact: true })).toHaveCount(0);
  await page.goto(`/sales-orders?mode=create&inquiryId=${saved.id}`);
  await expect(page.locator("body")).toContainText("Complete the agreed prices");
  await expect(page.getByRole("button", { name: "Create Sales Order", exact: true })).toHaveCount(0);
  expect(await db.salesOrder.count({ where: { customerId: c.id } })).toBe(0);
  checkpoint("cost-not-used-as-agreement", { agreedPrices: [null, null], orders: 0, productionCosts: [30000, 40000] });
  await shot(page, "agreement-required");
});

test("S3 Sales membuat pesanan untuk pelanggan Outstanding dan menunggu Manager", async ({ page }) => {
  const c = await customer("S3"); await history("S3-OLD", c);
  await login(page, "SALES"); started = Date.now();
  const order = await createOrder(page, c, "Pesanan baru UAT S3");
  expect(order).toMatchObject({ status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment", total: 500000, invoice: null });
  await page.goto(`/sales-orders/${order.id}`);
  await expect(page.locator("body")).toContainText("Pending");
  await expect(page.locator("body")).toContainText("Outstanding Payment");
  await expect(page.locator("body")).toContainText("Waiting for Manager Approval");
  checkpoint("pending-order", { order, explanation: "Belum dapat diproses menjadi invoice; Manager perlu memutuskan di Need Approval." });
  await shot(page, "pending-manager");
});

async function pendingFixture(key: string) {
  const c = await customer(key); await history(`${key}-OLD`, c);
  return db.salesOrder.create({ data: { orderNumber: `SO-UAT-${key}-NEW`, customerId: c.id, createdByUserId: users.SALES.id,
    orderDate: new Date(), status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment",
    subtotal: 500000, total: 500000, netSalesAmount: 500000, deliveryDestinationSnapshot: c.address,
    paymentTermType: "CREDIT", creditTermWeeks: 1,
    items: { create: { productId: products[0].id, itemName: products[0].productName, quantity: 10,
      baseUnitPrice: 50000, finalUnitPrice: 50000, subtotal: 500000 } } } });
}
async function decide(page: Page, id: string, decision: "Approve" | "Reject", reason: string) {
  await page.goto(`/sales-orders?tab=approval&view=${id}`);
  await submit(page, page.getByRole("button", { name: decision, exact: true }), reason);
}

test("M1 Manager meninjau lalu Approve dan kontrol Reject dengan alasan", async ({ page }) => {
  const order = await pendingFixture("M1"); const reject = await pendingFixture("M1-REJECT");
  await login(page, "MANAGER"); started = Date.now();
  await page.getByRole("link", { name: "Sales Orders", exact: true }).first().click();
  await page.getByRole("link", { name: /Need Approval/ }).click();
  const row = page.getByRole("row").filter({ hasText: order.orderNumber });
  await row.locator(`a[href*="view=${order.id}"]`).first().click();
  await expect(page.locator("body")).toContainText("Outstanding Payment");
  await shot(page, "pending-review");
  const reason = "Disetujui: pelanggan berkomitmen melunasi saldo lama 20 Oktober 2026; pesanan prioritas.";
  await submit(page, page.getByRole("button", { name: "Approve", exact: true }), reason);
  const approved = await db.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { invoice: true } });
  expect(approved.approvalStatus).toBe("Approved"); expect(approved.invoice).not.toBeNull();
  const audit = await db.auditTrail.findFirstOrThrow({ where: { entityId: order.id, action: "APPROVED" } });
  expect(audit.actorUsername).toBe(users.MANAGER.username); expect(audit.actionNote).toBe(reason);
  checkpoint("approved", { order: approved, audit, explanation: "Manager menyetujui dan invoice otomatis dibuat, pesanan dapat diproses." });
  await page.goto(`/sales-orders/${order.id}`); await expect(page.locator("body")).toContainText("Approved"); await shot(page, "approved-detail");
  expect(approved.approvalDecisionNote).toBe(reason);
  await decide(page, reject.id, "Reject", "Ditolak: saldo lama belum dilunasi dan risiko kredit belum dapat diterima.");
  const rejected = await db.salesOrder.findUniqueOrThrow({ where: { id: reject.id }, include: { invoice: true } });
  expect(rejected).toMatchObject({ approvalStatus: "Rejected", status: "Cancelled", invoice: null });
  expect(rejected.approvalDecisionNote).toContain("saldo lama");
  checkpoint("rejected-control", { order: rejected, explanation: "Ditolak -> Cancelled; invoice tidak dibuat." });
  await page.goto(`/sales-orders/${reject.id}`); await shot(page, "rejected-detail");
});

test("M2 Manager membaca KPI periode dan menelusuri masalah ke transaksi", async ({ page }) => {
  const sep = await customer("M2-SEPTEMBER"), oct = await customer("M2-OCTOBER");
  await history("M2-SEP", sep, { month: "2026-09", total: 9_000_000, paid: 4_000_000 });
  const target = await history("M2-OCT", oct, { total: 5_000_000, paid: 2_000_000 });
  await db.salesOrder.create({ data: { orderNumber: "SO-UAT-M2-CANCELLED", customerId: oct.id, createdByUserId: users.SALES.id,
    orderDate: new Date("2026-10-05T03:00:00Z"), status: "Cancelled", subtotal: 7_000_000, total: 7_000_000, netSalesAmount: 7_000_000 } });
  await db.salesOrder.create({ data: { orderNumber: "SO-UAT-M2-PENDING", customerId: oct.id, createdByUserId: users.SALES.id,
    orderDate: new Date("2026-10-05T03:00:00Z"), status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment",
    subtotal: 500_000, total: 500_000, netSalesAmount: 500_000 } });
  // The shared dashboard_private refresh routine explicitly targets public.
  // Prepare only the isolated read snapshot; do not invoke that routine in UAT.
  const monthFixtures = await db.salesOrder.findMany();
  const paymentFixtures = await db.payment.findMany();
  const trend = ["2026-09", "2026-10"].map((month, i) => ({ label: i ? "Oct" : "Sep",
    sales: monthFixtures.filter(row => row.orderDate.toISOString().startsWith(month)).reduce((sum, row) => sum + row.total, 0),
    payments: paymentFixtures.filter(row => row.paymentDate.toISOString().startsWith(month)).reduce((sum, row) => sum + row.amount, 0) }));
  const snapshot = { scopeType: "COMPANY", ownerUserId: null, periodStart: new Date("2026-09-01T00:00:00Z"), trend,
    lastAttemptAt: new Date(), lastSucceededAt: new Date(), lastRunStatus: "SUCCEEDED" };
  await db.dashboardAnalysisSnapshot.upsert({ where: { scopeKey: "company" }, create: { scopeKey: "company", ...snapshot }, update: snapshot });
  checkpoint("analysis-read-fixture", { isolatedSnapshot: true, manualRefreshIntentionallyExcluded: true, trend });
  await login(page, "MANAGER"); started = Date.now();
  await page.goto("/");
  const [orders, payments, invoices] = await Promise.all([db.salesOrder.findMany(), db.payment.findMany(), db.invoice.findMany()]);
  const allSales = orders.reduce((sum, row) => sum + row.total, 0), allPaid = payments.reduce((sum, row) => sum + row.amount, 0);
  const allOutstanding = invoices.filter(row => row.status !== "Cancelled").reduce((sum, row) => sum + row.remainingAmount, 0);
  const monthStart = new Date("2026-09-30T17:00:00Z"), monthEnd = new Date("2026-10-31T17:00:00Z");
  const monthSales = orders.filter(row => row.orderDate >= monthStart && row.orderDate < monthEnd).reduce((sum, row) => sum + row.total, 0);
  const monthPaid = payments.filter(row => row.paymentDate >= monthStart && row.paymentDate < monthEnd).reduce((sum, row) => sum + row.amount, 0);
  for (const [label, value] of [["All-time Order Value", allSales], ["Paid Amount", allPaid], ["Outstanding Receivables", allOutstanding]] as const) {
    await expect(page.locator("article.dashboard-summary-metric").filter({ hasText: label })).toContainText(formatCurrency(value));
  }
  const periodControls = await page.locator('main input[type="date"], main select').count();
  checkpoint("kpi-scope", { allSales, allPaid, allOutstanding, monthSales, monthPaid, periodControls,
    cancelledOrderValue: orders.filter(row => row.status === "Cancelled").reduce((sum, row) => sum + row.total, 0),
    interpretation: "KPI akumulatif seluruh tanggal; Outstanding adalah saldo kini; grafik riwayat terpisah." });
  await expect(page.locator("body")).toContainText("All recorded dates");
  await expect(page.locator("body")).toContainText("including pending and cancelled orders");
  await expect(page.locator("body")).toContainText("Received company payments across all dates");
  await shot(page, "dashboard-kpi-and-trend");
  await page.getByRole("link", { name: "Receivables", exact: true }).first().click();
  await expect(page).toHaveURL(/\/receivables/);
  await page.waitForLoadState("networkidle");
  await page.locator('input[name="q"]').fill(target.invoice.invoiceNumber); await page.locator('input[name="q"]').press("Enter");
  const row = page.getByRole("row").filter({ hasText: target.invoice.invoiceNumber });
  await expect(row).toContainText("Overdue"); await row.getByRole("link", { name: "View Invoice", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invoices\\?view=${target.invoice.id}`));
  await expect(page.getByRole("heading", { name: target.invoice.invoiceNumber, exact: true })).toBeVisible();
  await expect(page.locator("body")).toContainText(formatCurrency(3_000_000));
  checkpoint("priority-evidence", { invoice: target.invoice.invoiceNumber, remaining: 3_000_000, dueDate: "8 Oct 2026",
    priority: "Tagih pelanggan dengan invoice Overdue, telusuri saldo dan transaksi pendukung sebelum keputusan." });
  evidence.outcome = "KPI seluruh riwayat dan cakupan semua status dinyatakan jelas; bukti invoice ditemukan";
  await shot(page, "priority-invoice");
});

test("M3 Manager menemukan pelaku serta nilai sebelum dan sesudah perubahan transaksi", async ({ page }) => {
  const order = await pendingFixture("M3");
  await login(page, "MANAGER"); await decide(page, order.id, "Reject", "Perubahan UAT M3: ditolak karena tunggakan sebelumnya belum selesai.");
  const audit = await db.auditTrail.findFirstOrThrow({ where: { entityId: order.id, action: "REJECTED" } });
  checkpoint("actual-ui-change-prerequisite", { order: order.orderNumber, auditId: audit.id, setupNotTimed: true });
  started = Date.now();
  await page.getByRole("link", { name: "Audit Trail", exact: true }).first().click();
  await expect(page).toHaveURL(/\/audit-trail/);
  await page.waitForLoadState("networkidle");
  await page.locator('input[name="q"]').fill(order.orderNumber); await page.locator('input[name="q"]').press("Enter");
  await page.locator('select[name="action"]').selectOption("REJECTED");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/action=REJECTED/);
  const row = page.getByRole("row").filter({ hasText: order.orderNumber });
  await expect(row).toHaveCount(1); await expect(row).toContainText(users.MANAGER.username);
  const trigger = row.getByRole("button", { name: "View audit record details", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "View audit record details", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(users.MANAGER.username);
  await expect(dialog.getByRole("region", { name: "Before", exact: true })).toContainText("Pending");
  await expect(dialog.getByRole("region", { name: "After", exact: true })).toContainText("Rejected");
  await expect(dialog.getByRole("region", { name: "After", exact: true })).toContainText("Cancelled");
  await expect(dialog).toContainText("tunggakan sebelumnya");
  checkpoint("actor-and-change-found", { actor: audit.actorDisplayName, username: audit.actorUsername, oldValue: audit.oldValue, newValue: audit.newValue,
    actionNote: audit.actionNote, interpretation: "Manager mengubah Draft/Pending menjadi Cancelled/Rejected; alasan tunggakan." });
  await shot(page, "audit-detail");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(); return {
      left: rect.left, right: rect.right, viewportWidth: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }; });
    expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    checkpoint("audit-dialog-geometry", geometry);
    await shot(page, `audit-dialog-${width}`);
  }
  await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
});
