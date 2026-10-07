import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { applyOrderItemEdit, previewOrderItemEdit } from "../../src/lib/order-item-edit-service";
import { loadOrderItemEditContext } from "../../src/lib/order-item-edit-context";
import { orderEditFixture, editManager, editSales } from "../helpers/order-item-edit-fixture";

const db = new PrismaClient();
afterAll(() => db.$disconnect());

async function rollbackTest(work: (tx: Prisma.TransactionClient, marker: string) => Promise<void>) {
  const marker = `EDIT-STAGE2-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try { await db.$transaction(async tx => { await work(tx, marker); throw new Error("ROLLBACK_EDIT_STAGE2"); }, { timeout: 120000 }); }
  catch (error) { if (!(error instanceof Error) || error.message !== "ROLLBACK_EDIT_STAGE2") throw error; }
  expect(await db.customer.count({ where: { companyName: { startsWith: marker } } })).toBe(0);
}

describe("SO/PO item revision atomic service", () => {
  it.each(["DIRECT", "CUSTOMER_PO"] as const)("synchronizes %s, invoice and Pick with stable IDs, prices, headers and history", async source => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker, { source, approved: source === "CUSTOMER_PO" });
      const before = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      await tx.customer.update({ where: { id: f.customer.id }, data: { companyName: `${marker}-renamed`, npwp: null, address: "Changed master address" } });
      const request = { id: f.order.id, expectedVersion: before.version, items: [
        { itemId: f.a.id, productId: f.a.productId, quantity: 3 },
        { itemId: null, productId: f.products[2].id, quantity: 2 },
      ] };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      expect(preview).toMatchObject({ previousTotal: 350, total: 850, ppnAmount: 84, netSalesAmount: 766 });
      expect(preview.items[0]).toMatchObject({ baseUnitPrice: 120, finalUnitPrice: 150, priceSource: "stored" });
      expect((await loadOrderItemEditContext(f.order.id, editManager, tx)).order).toEqual(before);
      const result = await applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Correct item selection" }, editManager);
      const after = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      expect(result).toMatchObject({ revisionNumber: 2, invoiceRevisionNumber: 2, pickingListId: f.list!.id });
      expect(after).toMatchObject({ id: before.id, orderNumber: before.orderNumber, customerPoNumber: before.customerPoNumber,
        requiredDate: before.requiredDate, customerPoDocumentStoredName: before.customerPoDocumentStoredName,
        total: 850, version: before.version + 1, revisionNumber: 2, packStartedAt: null,
        customerNpwpSnapshot: before.customerNpwpSnapshot, ppnRateBasisPoints: 1100 });
      expect(after.items).toHaveLength(2);
      expect(after.items.find(item => item.id === f.a.id)).toMatchObject({ quantity: 3, itemName: "Stored A", productSkuSnapshot: "STORED-A", finalUnitPrice: 150 });
      expect(after.items.some(item => item.id === f.b.id)).toBe(false);
      expect(after.invoice).toMatchObject({ id: f.invoice!.id, invoiceNumber: f.invoice!.invoiceNumber,
        customerCompanySnapshot: f.invoice!.customerCompanySnapshot, customerAddressSnapshot: f.invoice!.customerAddressSnapshot,
        issueDate: f.invoice!.issueDate, dueDate: f.invoice!.dueDate, totalAmount: 850, remainingAmount: 850, paidAmount: 0,
        ppnAmount: 84, netSalesAmount: 766, version: 2, revisionNumber: 2 });
      expect(after.invoice!.itemsSnapshot).toEqual(expect.arrayContaining([expect.objectContaining({ itemName: "Stored A", quantity: 3, finalUnitPrice: 150 })]));
      expect(after.pickingList).toMatchObject({ id: f.list!.id, pickerName: "Original PIC", status: "Pending", notes: "Original note" });
      expect(after.pickingList!.items).toHaveLength(2);
      expect(after.pickingList!.items.find(item => item.salesOrderItemId === f.a.id)?.id).toBe(f.list!.items.find(item => item.salesOrderItemId === f.a.id)?.id);
      expect(after.pickingList!.items.every(item => !item.isChecked && item.availableQuantity === 0 && item.packedQuantity === 0)).toBe(true);
      expect(after.pickingList!.updatedAt.getTime()).toBeGreaterThan(before.pickingList!.updatedAt.getTime());
      expect(await tx.customerInquiry.findUnique({ where: { id: f.inquiry.id }, include: { items: true } })).toEqual(f.inquiry);
      expect(await tx.collectionTask.findUnique({ where: { id: f.task!.id } })).toEqual(f.task);
      if (source === "CUSTOMER_PO") expect(after).toMatchObject({ approvalStatus: "Approved", approvalDecisionNote: "Correct item selection", approvalDecidedById: editManager.id });
      const revision = await tx.salesOrderItemRevision.findFirstOrThrow({ where: { salesOrderId: after.id } });
      expect(revision.beforeSnapshot).toMatchObject({ total: 350, revisionNumber: 1 });
      expect(revision.afterSnapshot).toMatchObject({ total: 850, revisionNumber: 2 });
      expect(await tx.auditTrail.count({ where: { action: "ITEMS_REVISED", entityId: { in: [after.id, f.invoice!.id, f.list!.id] } } })).toBe(4);
      await expect(applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Retry" }, editManager)).rejects.toMatchObject({ code: "STALE_VERSION" });
      expect(await tx.salesOrderItemRevision.count({ where: { salesOrderId: after.id } })).toBe(1);
    });
  }, 130000);

  it("replaces a product on the same row and preserves its existing markup", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [
        { itemId: f.a.id, productId: f.products[2].id, quantity: 3 }, { itemId: f.b.id, productId: f.b.productId, quantity: 1 },
      ] };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      expect(preview.items[0]).toMatchObject({ baseUnitPrice: 200, markupPercent: 25, finalUnitPrice: 250 });
      await applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Replace product" }, editManager);
      const after = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      expect(after.items.find(item => item.id === f.a.id)).toMatchObject({ productId: f.products[2].id, finalUnitPrice: 250, quantity: 3 });
      expect(after.pickingList!.items.find(item => item.salesOrderItemId === f.a.id)).toMatchObject({ itemName: f.products[2].productName, orderedQuantity: 3 });
    });
  }, 130000);

  it("rejects stale prices, foreign rows, forged fields, no-ops, payment and Pack before any revision", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [{ itemId: f.a.id, productId: f.products[2].id, quantity: 3 }] };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      const before = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      await expect(previewOrderItemEdit(tx, { ...request, items: [{ itemId: "foreign", productId: f.products[2].id, quantity: 3 }] }, editManager)).rejects.toMatchObject({ code: "FOREIGN_ITEM" });
      await expect(previewOrderItemEdit(tx, { ...request, items: [{ itemId: f.a.id, productId: f.a.productId, quantity: 3, finalUnitPrice: 1 }] }, editManager)).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
      await expect(previewOrderItemEdit(tx, { ...request, items: f.order.items.map(item => ({ itemId: item.id, productId: item.productId, quantity: item.quantity })) }, editManager)).rejects.toMatchObject({ code: "NO_CHANGE" });
      await expect(previewOrderItemEdit(tx, request, editSales)).rejects.toMatchObject({ code: "SALES_INVOICED" });
      await expect(applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: " " }, editManager)).rejects.toThrow("A reason is required");
      await tx.product.update({ where: { id: f.products[2].id }, data: { listPrice: 300 } });
      await expect(applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Correction" }, editManager)).rejects.toMatchObject({ code: "PREVIEW_CHANGED" });
      expect((await loadOrderItemEditContext(f.order.id, editManager, tx)).order).toEqual(before);
      const fresh = await previewOrderItemEdit(tx, request, editManager);
      await tx.payment.create({ data: { invoiceId: f.invoice!.id, amount: 10, paymentDate: new Date(), paymentMethod: "Cash" } });
      await tx.invoice.update({ where: { id: f.invoice!.id }, data: { paidAmount: 10, remainingAmount: 340, status: "Partial" } });
      await expect(applyOrderItemEdit(tx, { ...request, quoteHash: fresh.quoteHash, reason: "Correction" }, editManager)).rejects.toMatchObject({ code: "PAYMENT_RECORDED" });
      await tx.pickingList.update({ where: { id: f.list!.id }, data: { status: "InProgress" } });
      expect(await tx.salesOrderItemRevision.count({ where: { salesOrderId: f.order.id } })).toBe(0);
      expect((await tx.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).total).toBe(350);
      const packOnly = await orderEditFixture(tx, `${marker}-pack`);
      const packRequest = { id: packOnly.order.id, expectedVersion: packOnly.order.version, items: [{ itemId: packOnly.a.id, productId: packOnly.a.productId, quantity: 3 }] };
      const packPreview = await previewOrderItemEdit(tx, packRequest, editManager);
      await tx.pickingList.update({ where: { id: packOnly.list!.id }, data: { status: "InProgress" } });
      await expect(applyOrderItemEdit(tx, { ...packRequest, quoteHash: packPreview.quoteHash, reason: "Correction" }, editManager)).rejects.toMatchObject({ code: "PACK_STARTED" });
    });
  }, 130000);

  it("keeps pre-invoice Pending approval on the latest revision without creating an invoice", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker, { invoiced: false, pending: true, pick: false });
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [{ itemId: f.a.id, productId: f.a.productId, quantity: 3 }] };
      const preview = await previewOrderItemEdit(tx, request, editSales);
      const result = await applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Correct draft" }, editSales);
      const after = (await loadOrderItemEditContext(f.order.id, editSales, tx)).order!;
      expect(result).toMatchObject({ revisionNumber: 2, approvalStatus: "Pending", invoiceId: null });
      expect(after).toMatchObject({ status: "Draft", approvalStatus: "Pending", approvalDecidedAt: null, approvalDecidedById: null });
      expect(await tx.invoice.count({ where: { salesOrderId: f.order.id } })).toBe(0);
    });
  }, 130000);

  it("supports zero-total settlement without a payment and closes only planned collections", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [{ itemId: null, productId: f.products[3].id, quantity: 1 }] };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      const result = await applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Replace with free sample" }, editManager);
      expect(result.invoiceRevisionNumber).toBe(2);
      expect(await tx.invoice.findUniqueOrThrow({ where: { id: f.invoice!.id } })).toMatchObject({ totalAmount: 0, paidAmount: 0, remainingAmount: 0, status: "Paid", revisionNumber: 2 });
      expect(await tx.payment.count({ where: { invoiceId: f.invoice!.id } })).toBe(0);
      expect(await tx.collectionTask.findUniqueOrThrow({ where: { id: f.task!.id } })).toMatchObject({ status: "Done", version: 2, notes: f.task!.notes });
    });
  }, 130000);

  it("rolls order, invoice, Pick and history back together when Audit Trail fails", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [{ itemId: f.a.id, productId: f.a.productId, quantity: 3 }] };
      const before = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      const preview = await previewOrderItemEdit(tx, request, editManager);
      await tx.$executeRawUnsafe("SAVEPOINT revision_attempt");
      const failing = new Proxy(tx, { get(target, key) {
        if (key === "auditTrail") return { createMany: async () => { throw new Error("Injected audit failure"); } };
        return Reflect.get(target, key);
      } });
      await expect(applyOrderItemEdit(failing, { ...request, quoteHash: preview.quoteHash, reason: "Correction" }, editManager)).rejects.toThrow("Injected audit failure");
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT revision_attempt");
      expect((await loadOrderItemEditContext(f.order.id, editManager, tx)).order).toEqual(before);
      expect(await tx.salesOrderItemRevision.count({ where: { salesOrderId: f.order.id } })).toBe(0);
    });
  }, 130000);
  it("claims a document version once even when two prepared writers reach the write together", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version, items: [
        { itemId: f.a.id, productId: f.a.productId, quantity: 3 }, { itemId: f.b.id, productId: f.b.productId, quantity: 1 },
      ] };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      let arrived = 0;
      let release!: () => void;
      const prepared = new Promise<void>(resolve => { release = resolve; });
      const interleaved = new Proxy(tx, { get(target, key) {
        if (key === "salesOrder") return new Proxy(target.salesOrder, { get(delegate, method) {
          if (method === "updateMany") return async (args: Prisma.SalesOrderUpdateManyArgs) => {
            arrived++;
            if (arrived === 2) release();
            await prepared;
            return delegate.updateMany(args);
          };
          return Reflect.get(delegate, method);
        } });
        return Reflect.get(target, key);
      } });
      const results = await Promise.allSettled([
        applyOrderItemEdit(interleaved, { ...request, quoteHash: preview.quoteHash, reason: "First writer" }, editManager),
        applyOrderItemEdit(interleaved, { ...request, quoteHash: preview.quoteHash, reason: "Second writer" }, editManager),
      ]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: "STALE_VERSION" });
      expect(await tx.salesOrderItemRevision.count({ where: { salesOrderId: f.order.id } })).toBe(1);
      expect(await tx.salesOrder.findUniqueOrThrow({ where: { id: f.order.id } })).toMatchObject({ total: 500, revisionNumber: 2, version: 2 });
    });
  }, 130000);
  it("synchronizes the full 1000-row payload bound with batch writes", async () => {
    await rollbackTest(async (tx, marker) => {
      const f = await orderEditFixture(tx, marker);
      const request = { id: f.order.id, expectedVersion: f.order.version,
        items: Array.from({ length: 1000 }, () => ({ itemId: null, productId: f.products[2].id, quantity: 1 })) };
      const preview = await previewOrderItemEdit(tx, request, editManager);
      expect(preview.total).toBe(200000);
      await applyOrderItemEdit(tx, { ...request, quoteHash: preview.quoteHash, reason: "Bulk item correction" }, editManager);
      const after = (await loadOrderItemEditContext(f.order.id, editManager, tx)).order!;
      expect(after.items).toHaveLength(1000);
      expect(after.pickingList!.items).toHaveLength(1000);
      expect(after.invoice!.itemsSnapshot).toHaveLength(1000);
      expect(after.invoice).toMatchObject({ totalAmount: 200000, remainingAmount: 200000, revisionNumber: 2 });
    });
  }, 130000);
});
