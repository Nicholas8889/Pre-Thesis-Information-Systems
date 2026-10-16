import { PrismaClient, type Customer, type Product, type User } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot } from "../src/lib/invoice-snapshot";

const db = new PrismaClient(), out = process.env.SIT_UMKM_OUTPUT_DIR!;
const marker = `B2-${randomUUID().slice(0, 8)}`;
const password = "UAT-Batch-Two-Only-123!", users: Record<string, User> = {};
const evidence: Record<string, unknown>[] = [], errors: string[] = [];
function record(name: string, value: unknown) {
  evidence.push({name, value});
  writeFileSync(`${out}/batch-two-evidence.json`, JSON.stringify({evidence, errors}, null, 2));
}
async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", {name: "Login", exact: true}).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/"); await page.waitForLoadState("networkidle");
}
async function submit(page: Page, trigger: Locator) {
  await page.waitForLoadState("networkidle");
  const response = page.waitForResponse(r => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await trigger.click();
  const dialog = page.getByRole("dialog", {name: /^Confirm /});
  const mode = await Promise.race([
    dialog.waitFor({state: "visible", timeout: 5000}).then(() => "confirm").catch(() => "none"),
    response.then(() => "sent")
  ]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill("UAT Batch 2 verification");
    await dialog.getByRole("button", {name: "Submit", exact: true}).click();
  }
  expect((await response).status()).toBeLessThan(400);
  await expect(dialog).toBeHidden(); await page.waitForLoadState("networkidle");
}
type Line = {product: Product; sku: string | null; quantity: number};
async function seed(customer: Customer, key: string, lines: Line[], po = false) {
  const total = lines.reduce((sum, line) => sum + line.quantity * 100000, 0);
  const order = await db.salesOrder.create({data: {
    orderNumber: `SO-${marker}-${key}`, source: po ? "CUSTOMER_PO" : "DIRECT",
    ...(po ? {customerPoNumber: `PO-${marker}-${key}`, requiredDate: new Date("2026-10-23"),
      customerPoDocumentName: "fixture.pdf", customerPoDocumentStoredName: `customer-purchase-orders/${marker}-${key}.pdf`,
      customerPoDocumentMimeType: "application/pdf"} : {}),
    customerId: customer.id, createdByUserId: users.SALES.id, orderDate: new Date(), status: "Invoiced",
    approvalStatus: "NotRequired", total, subtotal: total, netSalesAmount: total,
    paymentTermType: "CREDIT", creditTermWeeks: 2, deliveryDestinationSnapshot: customer.address,
    items: {create: lines.map(line => ({productId: line.product.id, itemName: line.product.productName,
      productSkuSnapshot: line.sku, quantity: line.quantity, baseUnitPrice: 100000,
      finalUnitPrice: 100000, subtotal: line.quantity * 100000}))}
  }, include: {items: true, customer: true}});
  const invoice = await db.invoice.create({data: {
    invoiceNumber: `INV-${marker}-${key}`, salesOrderId: order.id, customerId: customer.id,
    issueDate: new Date(), dueDate: new Date(Date.now() + 14 * 86400000), totalAmount: total,
    remainingAmount: total, netSalesAmount: total, paymentTermType: "CREDIT", creditTermWeeks: 2,
    ...buildInvoiceSnapshot(order)
  }});
  const pick = await db.pickingList.create({data: {
    pickingListNumber: `PL-${marker}-${key}`, salesOrderId: order.id, status: "Packed", usesChecklist: true,
    pickerName: "PIC UAT Batch 2", packedAt: new Date(), items: {create: order.items.map(item => ({
      salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: item.quantity, isChecked: true
    }))}
  }, include: {items: true}});
  return {order, invoice, pick, customer};
}
type Ready = Awaited<ReturnType<typeof seed>>;
let productA: Product, productB: Product, unrelatedId: string;
const cases: {key: string; ready: Ready[]; role: string}[] = [];

test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Isolated UAT runner required");
  const [scope] = await db.$queryRaw<{schema: string}[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(schema);
  for (const role of ["ADMIN", "MANAGER", "SALES"] as const) users[role] = await db.user.create({data: {
    username: `${marker}-${role}`.toLowerCase(), displayName: `Batch 2 ${role}`, role, passwordHash: hashPassword(password)
  }});
  [productA, productB] = await Promise.all(["A", "B"].map(key => db.product.create({data: {
    productName: `Kain ${key} UAT Batch 2`, sku: `${marker}-MASTER-${key}`.toUpperCase(), listPrice: 30000
  }})));
  const customer = (key: string) => db.customer.create({data: {name: `Penerima ${key}`, companyName: `${marker} ${key}`,
    phone: "081234567890", email: "uat@example.test", address: `Jl UAT ${key} Jakarta`, customerSegment: "UAT",
    portfolioOwnerUserId: users.SALES.id}});
  const other = await customer("OTHER");
  unrelatedId = (await db.deliveryNote.create({data: {deliveryNoteNumber: `SJ-${marker}-UNRELATED`, customerId: other.id,
    recipientName: "Unrelated recipient", recipientPhone: "0811111111", recipientAddress: other.address,
    deliveryDate: new Date(), status: "Draft", driverName: "Budi Santoso", vehiclePlateNumber: "B 1234 TJK"}})).id;
  const singleSO = await seed(await customer("SO"), "SO", [{product: productA, sku: "SNAP-SO-A", quantity: 2}]);
  const singlePO = await seed(await customer("PO"), "PO", [
    {product: productA, sku: "SNAP-PO-A", quantity: 2}, {product: productB, sku: null, quantity: 1}
  ], true);
  const combinedCustomer = await customer("COMBINED");
  const combinedSO = await seed(combinedCustomer, "C-SO", [
    {product: productA, sku: "SNAP-C-A", quantity: 1}, {product: productB, sku: "SNAP-C-B", quantity: 1}
  ]);
  const combinedPO = await seed(combinedCustomer, "C-PO", [{product: productA, sku: "SNAP-C-A", quantity: 2}], true);
  cases.push({key: "SO", ready: [singleSO], role: "ADMIN"}, {key: "PO", ready: [singlePO], role: "MANAGER"},
    {key: "COMBINED", ready: [combinedSO, combinedPO], role: "MANAGER"});
  record("fixtures", {unrelatedId, cases});
});
test.beforeEach(async ({page}) => {page.on("pageerror", error => errors.push(error.message));});
test.afterAll(async () => {record("runtime-errors", errors); await db.$disconnect();});

for (const key of ["SO", "PO", "COMBINED"]) test(`${key}: separate Create context, SKU snapshot, Draft edit and issued print`, async ({page}) => {
  const scenario = cases.find(item => item.key === key)!, {ready} = scenario;
  const unrelatedBefore = await db.deliveryNote.findUniqueOrThrow({where: {id: unrelatedId}});
  await login(page, scenario.role);
  await page.goto(`/surat-jalan?mode=create${key === "SO" ? `&view=${unrelatedId}` : ""}`);
  await page.waitForLoadState("networkidle");
  const create = page.locator("form").filter({has: page.locator('input[name="itemSelectionMode"]')});
  await expect(create).toHaveCount(1);
  await expect(page.locator('form input[name="id"]')).toHaveCount(0);
  await expect(page.locator('select[name="deliveryAssignmentId"]')).toHaveCount(1);
  await expect(page.getByRole("button", {name: "Simpan Draft", exact: true})).toHaveCount(0);
  await create.getByRole("combobox", {name: "Customer / delivery destination", exact: true})
    .selectOption({label: `${ready[0].customer.companyName} — ${ready[0].customer.address}`});
  for (const button of await create.getByRole("button", {name: "Select all ready items", exact: true}).all()) await button.click();
  await create.locator('select[name="deliveryAssignmentId"]').selectOption("budi-b1234");
  await create.locator('input[name="senderName"]').fill("PIC Batch 2");
  await page.screenshot({path: `${out}/${key}-single-create-context.png`, fullPage: true, caret: "initial"});
  await submit(page, create.getByRole("button", {name: "Create Draft Surat Jalan", exact: true}));
  const note = await db.deliveryNote.findFirstOrThrow({where: {sources: {some: {salesOrderId: ready[0].order.id}}},
    include: {items: true, sources: true}});
  expect(note.status).toBe("Draft"); expect(note.sources).toHaveLength(ready.length);
  const expected = ready.flatMap(source => source.order.items.map(item => ({
    pickItemId: source.pick.items.find(pick => pick.salesOrderItemId === item.id)!.id,
    sku: item.productSkuSnapshot, quantity: item.quantity
  })));
  expect(note.items).toHaveLength(expected.length);
  for (const item of expected) expect(note.items.find(saved => saved.pickingListItemId === item.pickItemId))
    .toMatchObject({productCode: item.sku, quantity: item.quantity, outstandingQuantity: 0});
  record(`${key}-draft-with-sku`, note);

  await page.goto(`/surat-jalan?view=${note.id}`);
  const edit = page.locator("form").filter({has: page.locator(`input[name="id"][value="${note.id}"]`)});
  await expect(edit).toHaveCount(1); await expect(create).toHaveCount(0);
  await edit.locator('input[name="recipientPhone"]').fill("0899999999");
  await edit.locator('input[name="confirmationNote"]').fill("UAT contact correction");
  await submit(page, edit.getByRole("button", {name: "Simpan Draft", exact: true}));
  const saved = await db.deliveryNote.findUniqueOrThrow({where: {id: note.id}, include: {items: true}});
  expect(saved).toMatchObject({status: "Draft", recipientPhone: "0899999999"});
  expect(saved.items.map(item => [item.id, item.productCode, item.quantity]).sort())
    .toEqual(note.items.map(item => [item.id, item.productCode, item.quantity]).sort());
  // Master changes must not replace the snapshot already saved on the shipment.
  await db.product.update({where: {id: productA.id}, data: {sku: `${marker}-CHANGED-${key}`.toUpperCase()}});
  await page.getByRole("button", {name: "Kirim Surat Jalan", exact: true}).click();
  await expect(page.getByRole("dialog", {name: "Kirim Surat Jalan?", exact: true})).toBeVisible();
  await submit(page, page.getByRole("button", {name: "Ya, Kirim & Kunci", exact: true}));
  const issued = await db.deliveryNote.findUniqueOrThrow({where: {id: note.id}, include: {items: true}});
  expect(issued.status).toBe("Issued");
  expect(issued.items.map(item => [item.id, item.productCode, item.quantity]).sort())
    .toEqual(note.items.map(item => [item.id, item.productCode, item.quantity]).sort());
  await page.goto(`/surat-jalan?view=${note.id}`);
  await expect(page.getByRole("button", {name: "Simpan Draft", exact: true})).toHaveCount(0);
  await expect(page.locator('input[name="recipientPhone"]')).toHaveCount(0);

  await login(page, "SALES"); await page.goto(`/surat-jalan?view=${note.id}`);
  await page.getByRole("link", {name: "Cetak", exact: true}).first().click();
  const article = page.locator("article");
  await expect(article.locator("tbody tr")).toHaveCount(expected.length);
  for (const source of ready) {
    await expect(article).toContainText(source.invoice.invoiceNumber);
    await expect(article).toContainText(source.order.customerPoNumber ?? source.order.orderNumber);
  }
  for (const sku of new Set(expected.map(item => item.sku).filter(Boolean))) await expect(article).toContainText(sku!);
  await expect(article).not.toContainText("CHANGED-");
  await expect(article.locator("[data-table-toolbar]")).toHaveCount(0);
  await page.emulateMedia({media: "print"});
  await expect(article.locator("tbody tr:visible")).toHaveCount(expected.length);
  await page.pdf({path: `${out}/${key}-issued-sku.pdf`, format: "A4", printBackground: true});
  await page.screenshot({path: `${out}/${key}-issued-print.png`, fullPage: true, caret: "initial"});
  await page.emulateMedia({media: "screen"});
  expect(await db.deliveryNote.findUniqueOrThrow({where: {id: unrelatedId}})).toEqual(unrelatedBefore);
  for (const source of ready) expect(await db.invoice.findUniqueOrThrow({where: {id: source.invoice.id}})).toEqual(source.invoice);
  if (key === "COMBINED") {
    expect(issued.items.filter(item => item.productCode === "SNAP-C-A").reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    expect(issued.items.filter(item => item.productCode === "SNAP-C-B").reduce((sum, item) => sum + item.quantity, 0)).toBe(1);
  }
  const audits = await db.auditTrail.findMany({where: {entityId: note.id}});
  expect(audits.map(item => item.action)).toEqual(expect.arrayContaining(["CREATED", "DRAFT_UPDATED", "ISSUED"]));
  record(`${key}-issued-locked-and-printable`, {issued, audits, expected, unrelatedUnchanged: true, invoicesUnchanged: true});
  expect(errors).toEqual([]);
});
