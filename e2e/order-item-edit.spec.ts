import { PrismaClient, type UserRole } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";
import { signSession } from "../src/lib/session-token";
import { orderEditFixture, editManager, editSales } from "../tests/helpers/order-item-edit-fixture";

const db = new PrismaClient();
type Fixture = Awaited<ReturnType<typeof orderEditFixture>>;
const fixtures: Record<string, Fixture> = {};
const users: Record<string, { id: string; username: string; role: UserRole; sessionVersion: number }> = {};
test.beforeAll(async () => {
  const schema = process.env.ORDER_EDIT_TEST_SCHEMA;
  if (!schema || !/^order_edit_ui_[a-f0-9_]+$/.test(schema)) throw new Error("UI tests require the isolated-schema runner");
  const [state] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  expect(state.schema).toBe(schema);
  for (const role of ["MANAGER", "ADMIN", "SALES"] as const) {
    const id = role === "MANAGER" ? editManager.id : role === "SALES" ? editSales.id : "edit-admin";
    users[role] = await db.user.create({ data: { id, username: id, displayName: `Test ${role}`, role, passwordHash: "test-only-no-password-login" }, select: { id: true, username: true, role: true, sessionVersion: true } });
  }
  for (const kind of ["so", "po", "cancel", "sales", "prices", "pack", "paid", "delivery", "foreign", "layout"] as const) {
    fixtures[kind] = await db.$transaction(tx => orderEditFixture(tx, `UI-${kind}`, {
      source: kind === "po" ? "CUSTOMER_PO" : "DIRECT", approved: kind === "po",
      invoiced: !["sales", "foreign"].includes(kind), pending: kind === "sales",
    }), { timeout: 30000 });
  }
  const paid = fixtures.paid;
  await db.payment.create({ data: { invoiceId: paid.invoice!.id, amount: 10, paymentDate: new Date(), paymentMethod: "Cash" } });
  await db.invoice.update({ where: { id: paid.invoice!.id }, data: { paidAmount: 10, remainingAmount: 340, status: "Partial" } });
  const delivery = fixtures.delivery;
  await db.deliveryNote.create({ data: { deliveryNoteNumber: "UI-DRAFT-SJ", pickingListId: delivery.list!.id, invoiceId: delivery.invoice!.id,
    salesOrderId: delivery.order.id, customerId: delivery.customer.id, recipientName: "Test recipient", recipientPhone: "",
    recipientAddress: delivery.customer.address, deliveryDate: new Date(), status: "Draft" } });
  await db.salesOrder.update({ where: { id: fixtures.foreign.order.id }, data: { createdByUserId: editManager.id } });
});
test.afterAll(() => db.$disconnect());
async function authenticate(page: Page, role: keyof typeof users) {
  const user = users[role];
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "cv_tajuk_session", value: await signSession({ userId: user.id, username: user.username,
    role: user.role, sessionVersion: user.sessionVersion, exp: Math.floor(Date.now() / 1000) + 3600 }),
    url: "http://127.0.0.1:3129", httpOnly: true, sameSite: "Lax" }]);
}
function href(f: Fixture) { return `/${f.order.source === "CUSTOMER_PO" ? "customer-purchase-orders" : "sales-orders"}/${f.order.id}`; }
function editor(page: Page, f: Fixture) { return page.locator(`[data-order-item-editor="${f.order.id}"]`); }
async function openEditor(page: Page, f: Fixture) {
  await page.goto(href(f));
  const panel = editor(page, f);
  await expect(panel.getByRole("button", { name: "Edit Barang" })).toBeEnabled();
  await panel.getByRole("button", { name: "Edit Barang" }).click();
  return panel;
}
async function confirmation(page: Page, f: Fixture) {
  await editor(page, f).getByRole("button", { name: "Simpan Perubahan" }).click();
  const dialog = page.getByRole("dialog");
  try { await expect(dialog).toBeVisible({ timeout: 30000 }); }
  catch (error) {
    // A transient DB timeout leaves the draft unchanged and allows user retry.
    if (!await editor(page, f).getByText("Preview belum berhasil dimuat. Coba lagi.", { exact: true }).isVisible()) throw error;
    await editor(page, f).getByRole("button", { name: "Simpan Perubahan" }).click();
    await expect(dialog).toBeVisible({ timeout: 30000 });
  }
  return dialog;
}

for (const kind of ["so", "po"] as const) {
  test(`inline ${kind.toUpperCase()} edit syncs invoice/Pick and prints the new revision`, async ({ page }) => {
    await authenticate(page, "MANAGER"); const f = fixtures[kind];
    const panel = await openEditor(page, f);
    await panel.getByRole("spinbutton", { name: "Qty 1", exact: true }).fill("3");
    await panel.getByRole("button", { name: "Tambah Barang" }).click();
    await panel.getByRole("combobox", { name: "Product 3", exact: true }).selectOption(f.products[2].id);
    await panel.getByRole("spinbutton", { name: "Qty 3", exact: true }).fill("2");
    await panel.getByRole("button", { name: "Hapus barang 2", exact: true }).click();
    await expect(panel.locator('input:not([type="hidden"])')).toHaveCount(2);
    const first = await confirmation(page, f);
    await expect(first).toContainText("Total:"); await expect(first).toContainText("850");
    await expect(first.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).total).toBe(350);
    if (kind === "so") await page.screenshot({ path: "tmp/order-edit-ui-confirmation.png", fullPage: true });
    await first.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel.getByRole("spinbutton", { name: "Qty 1", exact: true })).toHaveValue("3");
    const dialog = await confirmation(page, f);
    await dialog.getByRole("textbox").fill("Correct order items in UI");
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(panel).toContainText("Perubahan barang tersimpan");
    await expect(panel.getByRole("button", { name: "Edit Barang" })).toBeEnabled();
    await expect(page.getByText("Revisi 2", { exact: true }).first()).toBeVisible();
    const updated = await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id }, include: { items: true, invoice: true, pickingList: { include: { items: true } } } });
    expect(updated).toMatchObject({ total: 850, revisionNumber: 2, packStartedAt: null });
    expect(updated.invoice).toMatchObject({ id: f.invoice!.id, totalAmount: 850, revisionNumber: 2, dueDate: f.invoice!.dueDate });
    expect(updated.pickingList!.items.map(item => item.orderedQuantity).sort()).toEqual([2, 3]);
    expect(updated.items.find(item => item.id === f.a.id)?.finalUnitPrice).toBe(150);
    if (kind === "so") await page.screenshot({ path: "tmp/order-edit-ui-saved.png", fullPage: true });
    await page.goto(`/invoices/${f.invoice!.id}/print`);
    await expect(page.getByText("Revisi 2", { exact: true })).toBeVisible();
  });
}
test("Batal discards edits and keeps the existing detail layout", async ({ page }) => {
  await authenticate(page, "MANAGER"); const f = fixtures.cancel;
  const panel = await openEditor(page, f);
  await panel.getByRole("spinbutton", { name: "Qty 1", exact: true }).fill("4");
  await panel.getByRole("combobox", { name: "Product 1", exact: true }).selectOption(f.products[2].id);
  await panel.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(panel.getByRole("combobox")).toHaveCount(0);
  await expect(panel).toContainText("Stored A");
  expect((await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).revisionNumber).toBe(1);
});
test("role, payment, draft delivery and portfolio locks are visible", async ({ page }) => {
  await authenticate(page, "ADMIN"); await page.goto(href(fixtures.po));
  await expect(editor(page, fixtures.po).getByRole("button", { name: "Edit Barang" })).toBeDisabled();
  await expect(editor(page, fixtures.po)).toContainText("only be revised by Manager");
  for (const kind of ["paid", "delivery"] as const) {
    await page.goto(href(fixtures[kind]));
    await expect(editor(page, fixtures[kind]).getByRole("button", { name: "Edit Barang" })).toBeDisabled();
  }
  await authenticate(page, "SALES"); await page.goto(href(fixtures.so));
  await expect(editor(page, fixtures.so).getByRole("button", { name: "Edit Barang" })).toBeDisabled();
  const salesPanel = await openEditor(page, fixtures.sales);
  await salesPanel.getByRole("spinbutton", { name: "Qty 1", exact: true }).fill("3");
  const dialog = await confirmation(page, fixtures.sales);
  await expect(dialog).toContainText("menunggu approval Manager");
  await dialog.getByRole("textbox").fill("Correct draft items");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(salesPanel).toContainText("Perubahan barang tersimpan");
  expect((await db.salesOrder.findUniqueOrThrow({ where: { id: fixtures.sales.order.id } })).approvalStatus).toBe("Pending");
  const response = await page.goto(href(fixtures.foreign));
  expect(response?.status()).toBe(404);
});
test("a stale price keeps edits and requires a fresh confirmation", async ({ page }) => {
  await authenticate(page, "MANAGER"); const f = fixtures.prices;
  const panel = await openEditor(page, f);
  await panel.getByRole("combobox", { name: "Product 1", exact: true }).selectOption(f.products[2].id);
  await panel.getByRole("spinbutton", { name: "Qty 1", exact: true }).fill("3");
  const dialog = await confirmation(page, f);
  await db.product.update({ where: { id: f.products[2].id }, data: { listPrice: 300 } });
  await dialog.getByRole("textbox").fill("Change product");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(panel).toContainText("Review a fresh preview");
  await expect(panel.getByRole("spinbutton", { name: "Qty 1", exact: true })).toHaveValue("3");
  expect((await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).total).toBe(350);
  const fresh = await confirmation(page, f);
  await expect(fresh).toContainText("1.175");
  await fresh.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("Pack starting while confirmation is open blocks saving and reload shows the lock", async ({ page }) => {
  await authenticate(page, "MANAGER"); const f = fixtures.pack;
  const panel = await openEditor(page, f);
  await panel.getByRole("spinbutton", { name: "Qty 1", exact: true }).fill("3");
  const dialog = await confirmation(page, f);
  await db.pickingList.update({ where: { id: f.list!.id }, data: { status: "InProgress" } });
  await dialog.getByRole("textbox").fill("Quantity correction");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(panel).toContainText("already entered Pack");
  expect((await db.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).total).toBe(350);
  await panel.getByRole("button", { name: "Muat Ulang" }).click();
  await expect(panel.getByRole("button", { name: "Edit Barang" })).toBeDisabled();
});
test("editor remains contained on desktop and mobile", async ({ page }) => {
  await authenticate(page, "MANAGER"); const f = fixtures.layout;
  await page.setViewportSize({ width: 1440, height: 1000 });
  const panel = await openEditor(page, f);
  await expect(panel.getByRole("button", { name: "Simpan Perubahan" })).toBeVisible();
  await panel.screenshot({ path: "tmp/order-edit-ui-editor.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole("button", { name: "Batal", exact: true })).toBeVisible();
  const sizes = await panel.evaluate(element => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth }));
  expect(sizes.width).toBeLessThanOrEqual(sizes.viewport);
  await panel.screenshot({ path: "tmp/order-edit-ui-mobile.png" });
});
