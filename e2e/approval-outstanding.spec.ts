import { PrismaClient, type User } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { formatCurrency } from "../src/lib/format";

const db = new PrismaClient();
const password = "Approval-Regression-Test-Only-123!";
const users: Record<string, User> = {};
let customerId: string, productId: string;
test.beforeAll(async () => {
  const [scope] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  expect(scope.schema).toBe(process.env.SIT_UMKM_SCHEMA);
  expect(scope.schema).toMatch(/^sit_umkm_[a-f0-9_]+$/);
  for (const role of ["SALES", "MANAGER"] as const) {
    users[role] = await db.user.create({ data: {
      username: `approval_${role.toLowerCase()}`, displayName: `Approval ${role}`, role, passwordHash: hashPassword(password)
    } });
  }
  const customer = await db.customer.create({ data: {
    companyName: "Approval customer without delivery", name: "Approval fixture", phone: "", email: "", address: "Jakarta", customerSegment: "Retail", portfolioOwnerUserId: users.SALES.id
  } });
  customerId = customer.id;
  productId = (await db.product.create({ data: { productName: "Approval product", listPrice: 100000 } })).id;
  const order = await db.salesOrder.create({ data: { orderNumber: "SO-APPROVAL-OLD", customerId, orderDate: new Date(), status: "Invoiced", subtotal: 4875000, total: 4875000, netSalesAmount: 4875000 } });
  await db.invoice.create({ data: { invoiceNumber: "INV-APPROVAL-UNDELIVERED", salesOrderId: order.id, customerId, issueDate: new Date(), dueDate: new Date("2099-01-01"), totalAmount: 4875000, netSalesAmount: 4875000, remainingAmount: 4875000, status: "Unpaid" } });
});
test.afterAll(async () => { await db.$disconnect(); });

async function login(page: Page, role: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/");
}
async function submit(page: Page, trigger: Locator, note = "Approval regression") {
  await page.waitForLoadState("networkidle");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /^Confirm / });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill(note);
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(dialog).toBeHidden();
}

for (const source of ["DIRECT", "CUSTOMER_PO"] as const) test(`${source}: Sales requires Manager approval for undelivered unpaid invoices`, async ({ page }) => {
  await login(page, "SALES");
  const outstanding = await db.invoice.aggregate({ where: { customerId, status: { not: "Cancelled" } }, _sum: { remainingAmount: true } });
  const base = source === "DIRECT" ? "/sales-orders" : "/customer-purchase-orders";
  await page.goto(`${base}?mode=create`);
  await page.waitForLoadState("networkidle");
  const form = page.locator("form").filter({ has: page.locator('input[name="items"]') });
  await form.locator('select[name="customerId"]').selectOption(customerId);
  await expect(form).toContainText("Outstanding Payment");
  await expect(form).toContainText(formatCurrency(outstanding._sum.remainingAmount ?? 0));
  if (source === "CUSTOMER_PO") {
    await form.locator('input[name="requiredDate"]').fill("2026-12-31");
    await form.locator('input[name="customerPoDocument"]').setInputFiles({ name: "approval.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n") });
    await form.locator('select[name="paymentTermType"]').selectOption("CREDIT");
    await form.locator('select[name="creditTerm"]').selectOption("3m");
  }
  await form.getByRole("combobox", { name: "Product Name", exact: true }).first().selectOption(productId);
  await submit(page, form.getByRole("button", { name: source === "DIRECT" ? "Create Sales Order" : "Create Customer PO", exact: true }));
  await expect(page).toHaveURL(/tab=approval.*success=/);
  const order = await db.salesOrder.findFirstOrThrow({ where: { customerId, source, approvalStatus: "Pending" }, include: { invoice: true } });
  expect(order).toMatchObject({ status: "Draft", approvalStatus: "Pending", invoice: null });
  await login(page, "MANAGER");
  await page.goto(`${base}?tab=approval&q=${order.orderNumber}`);
  await page.getByRole("link", { name: source === "DIRECT" ? "View full sales order detail" : "View full customer po detail", exact: true }).click();
  await expect(page.getByRole("heading", { name: order.orderNumber, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer unpaid invoices", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "INV-APPROVAL-UNDELIVERED", exact: true })).toBeVisible();
  const action = source === "DIRECT" ? "Approve" : "Reject";
  await submit(page, page.getByRole("button", { name: action, exact: true }), source === "DIRECT" ? "Reviewed outstanding invoice" : "Settle the previous invoice first");
  await expect(page).toHaveURL(/success=/);
  expect(await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
    approvalStatus: source === "DIRECT" ? "Approved" : "Rejected", status: source === "DIRECT" ? "Invoiced" : "Cancelled"
  });
  expect(await db.invoice.count({ where: { salesOrderId: order.id } })).toBe(source === "DIRECT" ? 1 : 0);
  expect(await db.deliveryNote.count({ where: { customerId } })).toBe(0);
});
