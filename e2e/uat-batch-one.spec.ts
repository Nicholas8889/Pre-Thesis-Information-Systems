import { PrismaClient, type User } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot } from "../src/lib/invoice-snapshot";
import { toBusinessDateInputWib } from "../src/lib/business-clock";

const db = new PrismaClient();
const out = process.env.SIT_UMKM_OUTPUT_DIR!;
const password = "UAT-Batch-One-Only-123!";
const evidence: Record<string, unknown>[] = [];
const users: Record<string, User> = {};
const marker = `B1-${randomUUID().slice(0, 8)}`;
const errors: string[] = [];
function record(name: string, value: unknown) {
  evidence.push({name, value});
  writeFileSync(`${out}/batch-one-evidence.json`, JSON.stringify({evidence, errors}, null, 2));
}

async function seedOrder(key: string, count: number, pending = false) {
  const customer = await db.customer.create({data: {
    name: `Contact ${key}`, companyName: `${marker} ${key}`, address: "Jl UAT Jakarta",
    phone: "081234567890", email: "uat@example.test", customerSegment: "UAT", portfolioOwnerUserId: users.SALES.id
  }});
  return db.salesOrder.create({data: {
    orderNumber: `SO-${marker}-${key}`, customerId: customer.id, createdByUserId: users.SALES.id,
    orderDate: new Date(), status: pending ? "Draft" : "Confirmed",
    approvalStatus: pending ? "Pending" : "NotRequired", approvalRisk: pending ? "Outstanding Payment" : null,
    total: count * 100000, subtotal: count * 100000, netSalesAmount: count * 100000,
    paymentTermType: "IMMEDIATE", deliveryDestinationSnapshot: customer.address,
    items: {create: Array.from({length: count}, (_, i) => ({
      itemName: `Produk ${String(i + 1).padStart(2, "0")} ${marker}`,
      productSkuSnapshot: `SKU-${i + 1}`, quantity: 1, baseUnitPrice: 100000,
      finalUnitPrice: 100000, subtotal: 100000
    }))}
  }, include: {items: true, customer: true}});
}
type Order = Awaited<ReturnType<typeof seedOrder>>;
let manual: Order, pending: Order, printOrder: Order, printInvoiceId: string, pickId: string, legacyPickId: string, noteId: string;

async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", {name: "Login", exact: true}).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/"); await page.waitForLoadState("networkidle");
}
async function submit(page: Page, trigger: Locator, reason: string) {
  await page.waitForLoadState("networkidle");
  const response = page.waitForResponse(r => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await trigger.click();
  const dialog = page.getByRole("dialog", {name: /^Confirm /});
  const mode = await Promise.race([
    dialog.waitFor({state: "visible", timeout: 5000}).then(() => "confirm").catch(() => "none"),
    response.then(() => "sent")
  ]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill(reason);
    await dialog.getByRole("button", {name: "Submit", exact: true}).click();
  }
  expect((await response).status()).toBeLessThan(400);
  await expect(dialog).toBeHidden(); await page.waitForLoadState("networkidle");
}
async function audit(entityId: string, action: string, reason: string) {
  const entries = await db.auditTrail.findMany({where: {entityId, action}});
  expect(entries.some(entry => entry.actionNote === reason)).toBe(true);
  record(`audit-${action}`, entries);
}

test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Isolated UAT runner required");
  const [scope] = await db.$queryRaw<{schema: string}[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(schema);
  for (const role of ["ADMIN", "MANAGER", "SALES"] as const) users[role] = await db.user.create({data: {
    username: `${marker}-${role}`.toLowerCase(), displayName: `UAT ${role}`, role, passwordHash: hashPassword(password)
  }});
  manual = await seedOrder("MANUAL", 1); pending = await seedOrder("APPROVAL", 1, true);
  printOrder = await seedOrder("PRINT", 15);
  const invoice = await db.invoice.create({data: {
    invoiceNumber: `INV-${marker}-PRINT`, customerId: printOrder.customerId, salesOrderId: printOrder.id,
    issueDate: new Date(), dueDate: new Date(), totalAmount: printOrder.total,
    remainingAmount: printOrder.total, netSalesAmount: printOrder.total, ...buildInvoiceSnapshot(printOrder)
  }});
  printInvoiceId = invoice.id;
  await db.salesOrder.update({where: {id: printOrder.id}, data: {status: "Invoiced"}});
  const pick = await db.pickingList.create({data: {
    pickingListNumber: `PL-${marker}`, salesOrderId: printOrder.id, usesChecklist: true, status: "Packed",
    pickerName: "PIC UAT", packerName: "PIC UAT", packedAt: new Date(), items: {create: printOrder.items.map(item => ({
      salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: 1, availableQuantity: 1,
      packedQuantity: 1, availabilityStatus: "Available", isChecked: true
    }))}
  }, include: {items: true}});
  pickId = pick.id;
  const legacy = await seedOrder("LEGACY-PICK", 15);
  const legacyPick = await db.pickingList.create({data: {
    pickingListNumber: `PL-${marker}-LEGACY`, salesOrderId: legacy.id, usesChecklist: false, pickerName: "PIC UAT",
    items: {create: legacy.items.map(item => ({salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: 1}))}
  }});
  legacyPickId = legacyPick.id;
  const note = await db.deliveryNote.create({data: {
    deliveryNoteNumber: `SJ-${marker}`, customerId: printOrder.customerId, salesOrderId: printOrder.id,
    invoiceId: invoice.id, pickingListId: pick.id, recipientName: printOrder.customer.name,
    recipientPhone: printOrder.customer.phone, recipientAddress: printOrder.customer.address,
    deliveryDate: new Date(), status: "Issued", issuedAt: new Date(), senderName: "PIC UAT",
    driverName: "Driver UAT", vehiclePlateNumber: "B 1234 UAT",
    items: {create: pick.items.map((item, i) => ({
      pickingListItemId: item.id, itemName: item.itemName, productCode: `SKU-${i + 1}`,
      orderedQuantitySnapshot: 1, packedQuantitySnapshot: 1, quantity: 1, outstandingQuantity: 0
    }))}
  }});
  noteId = note.id;
  record("fixture-ids", {manual: manual.id, pending: pending.id, printInvoiceId, pickId, legacyPickId, noteId});
});
test.beforeEach(async ({page}) => {page.on("pageerror", error => errors.push(error.message));});
test.afterAll(async () => {record("runtime-errors", errors); await db.$disconnect();});

test("invoice customer notes stay separate across creation approval edits and cancellation", async ({page}) => {
  await login(page, "MANAGER");
  // Manager direct creation must not copy its confirmation reason into the invoice.
  const product = await db.product.create({data: {productName: `${marker} Product`, sku: `${marker}-P`.toUpperCase(), listPrice: 30000}});
  await page.goto("/sales-orders?mode=create");
  const form = page.locator("form").filter({has: page.locator('input[name="items"]')});
  await form.locator('select[name="customerId"]').selectOption(manual.customerId);
  await form.getByRole("combobox", {name: "Product Name", exact: true}).first().selectOption(product.id);
  await form.getByRole("spinbutton", {name: "Qty", exact: true}).first().fill("1");
  await form.getByRole("spinbutton", {name: "Base Unit Price", exact: true}).first().fill("100000");
  await form.locator('select[name="paymentTermType"]').selectOption("IMMEDIATE");
  await form.locator('input[name="notes"]').fill(`${marker}-AUTO`);
  const autoReason = "INTERNAL: Manager verified direct order";
  await submit(page, form.getByRole("button", {name: "Create Sales Order", exact: true}), autoReason);
  const auto = await db.salesOrder.findFirstOrThrow({where: {notes: {contains: `${marker}-AUTO`}}, include: {invoice: true}});
  expect(auto.invoice?.notes).toBeNull(); await audit(auto.invoice!.id, "CREATED", autoReason);

  await login(page, "ADMIN"); await page.goto(`/sales-orders/${manual.id}`);
  const generateReason = "INTERNAL: Admin checked manual invoice";
  await submit(page, page.getByRole("button", {name: "Generate Invoice", exact: true}).first(), generateReason);
  const generated = await db.invoice.findUniqueOrThrow({where: {salesOrderId: manual.id}});
  expect(generated.notes).toBeNull(); await audit(generated.id, "CREATED", generateReason);

  await login(page, "MANAGER"); await page.goto(`/sales-orders?tab=approval&view=${pending.id}`);
  const approvalReason = "INTERNAL: outstanding reviewed for approval";
  await submit(page, page.getByRole("button", {name: "Approve", exact: true}), approvalReason);
  const approved = await db.invoice.findUniqueOrThrow({where: {salesOrderId: pending.id}});
  expect(approved.notes).toBeNull(); await audit(pending.id, "APPROVED", approvalReason);
  await audit(approved.id, "CREATED", approvalReason);

  await login(page, "ADMIN"); await page.goto(`/invoices?view=${generated.id}`);
  const notes = "Customer: please contact reception before delivery.";
  const noteReason = "INTERNAL: customer instructions reviewed";
  const noteForm = page.locator("form").filter({has: page.locator('textarea[name="notes"]')});
  await noteForm.locator('textarea[name="notes"]').fill(notes);
  await submit(page, noteForm.getByRole("button", {name: "Save Notes", exact: true}), noteReason);
  expect((await db.invoice.findUniqueOrThrow({where: {id: generated.id}})).notes).toBe(notes);
  await audit(generated.id, "NOTE_UPDATED", noteReason);
  await page.getByRole("link", {name: "Cetak Invoice", exact: true}).click();
  await expect(page.locator("article")).toContainText(notes);
  for (const internal of [generateReason, noteReason]) await expect(page.locator("article")).not.toContainText(internal);
  await page.pdf({path: `${out}/invoice-customer-notes.pdf`, format: "A4"});

  // A blank customer note remains blank even when a confirmation reason is supplied.
  await page.goto(`/invoices?view=${generated.id}`);
  await page.locator('textarea[name="notes"]').fill("");
  await submit(page, page.getByRole("button", {name: "Save Notes", exact: true}), "INTERNAL: remove outdated instructions");
  expect((await db.invoice.findUniqueOrThrow({where: {id: generated.id}})).notes).toBeNull();
  const cancelReason = "INTERNAL: customer postpones order";
  const cancelForm = page.locator("form").filter({has: page.locator('textarea[name="cancellationReason"]')});
  await cancelForm.locator('textarea[name="cancellationReason"]').fill(cancelReason);
  await submit(page, cancelForm.getByRole("button", {name: "Cancel Invoice", exact: true}), cancelReason);
  const cancelled = await db.invoice.findUniqueOrThrow({where: {id: generated.id}});
  expect(cancelled).toMatchObject({status: "Cancelled", notes: null, cancellationReason: cancelReason});
  await audit(cancelled.id, "CANCELLED", cancelReason);
  record("notes-separated-all-paths", {auto: auto.invoice, generated, approved, cancelled});
  expect(errors).toEqual([]);
});

test("all print documents retain fifteen rows after filtered client navigation", async ({page}) => {
  await login(page, "ADMIN");
  const cases = [
    {kind: "invoice", from: `/invoices?view=${printInvoiceId}`, path: `/invoices/${printInvoiceId}/print`, label: "Cetak Invoice"},
    {kind: "checklist", from: `/pick-pack?view=${pickId}`, path: `/pick-pack/${pickId}/print`, label: "Print Pick & Pack"},
    {kind: "legacy-pick", from: `/pick-pack?view=${legacyPickId}`, path: `/pick-pack/${legacyPickId}/print`, label: "Print Pick & Pack"},
    {kind: "surat-jalan", from: `/surat-jalan?view=${noteId}`, path: `/surat-jalan/${noteId}/print`, label: "Cetak"}
  ];
  for (const item of cases) {
    await page.goto(item.from); await page.waitForLoadState("networkidle");
    const search = page.locator('input[type="search"][aria-label="Search rows containing this text"]:enabled').first();
    if (await search.count()) await search.fill("Produk 01");
    await page.getByRole("link", {name: item.label, exact: true}).first().click();
    await expect(page).toHaveURL(`http://127.0.0.1:3137${item.path}`);
    await page.waitForLoadState("networkidle");
    const article = page.locator("article");
    await expect(article.locator("tbody tr")).toHaveCount(15);
    await expect(article.locator("tbody tr:visible")).toHaveCount(15);
    await expect(article.locator("[data-table-toolbar], .table-enhancer-pagination")).toHaveCount(0);
    // Print CSS also restores rows hidden by an already running screen enhancer.
    await article.locator("tbody tr").nth(1).evaluate(row => {(row as HTMLElement).hidden = true;});
    await page.emulateMedia({media: "print"});
    await expect(article.locator("tbody tr:visible")).toHaveCount(15);
    const printedNames = await article.locator("tbody tr").allTextContents();
    expect(printedNames.join(" ")).toContain("Produk 15");
    await page.pdf({path: `${out}/${item.kind}-all-15-rows.pdf`, format: "A4", printBackground: true});
    await page.screenshot({path: `${out}/${item.kind}-print.png`, fullPage: true, caret: "initial"});
    await page.emulateMedia({media: "screen"});
    record(`print-${item.kind}`, {rows: printedNames, count: printedNames.length, screenFilterCannotTruncate: true});
  }
  expect(errors).toEqual([]);
});

test("payment date defaults to WIB and an explicitly chosen receipt date persists", async ({page}) => {
  await login(page, "ADMIN"); await page.goto(`/payments?invoiceId=${printInvoiceId}`);
  const form = page.locator("form#record-payment");
  const expected = toBusinessDateInputWib(new Date());
  await expect(form.locator('input[name="paymentDate"]')).toHaveValue(expected);
  const chosen = toBusinessDateInputWib(new Date(Date.now() - 86400000));
  await form.locator('input[name="paymentDate"]').fill(chosen);
  await form.locator('input[name="amount"]').fill("100000");
  await form.locator('select[name="paymentMethod"]').selectOption("BankTransfer");
  await form.locator('input[name="notes"]').fill("Batch 1 receipt");
  await submit(page, form.getByRole("button", {name: "Record Payment", exact: true}), "UAT receipt date checked");
  const payment = await db.payment.findFirstOrThrow({where: {invoiceId: printInvoiceId}});
  expect(payment.paymentDate.toISOString().slice(0, 10)).toBe(chosen);
  const invoice = await db.invoice.findUniqueOrThrow({where: {id: printInvoiceId}});
  expect(invoice).toMatchObject({paidAmount: 100000, remainingAmount: 1400000, status: "Partial"});
  record("payment-date", {expectedDefault: expected, chosen, payment, invoice});
  expect(errors).toEqual([]);
});
