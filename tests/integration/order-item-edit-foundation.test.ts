import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { loadOrderItemEditContext, lockOrderItemEditContext } from "../../src/lib/order-item-edit-context";
import { buildOrderItemRevisionData, persistOrderItemRevision } from "../../src/lib/order-item-revisions";

const db = new PrismaClient();
const migration = readFileSync("prisma/migrations/20261005090000_order_item_edit_foundation/migration.sql", "utf8");
function sqlStatements(sql: string) {
  const chunks: string[] = []; let current = ""; let inBody = false;
  for (let i = 0; i < sql.length; i++) {
    if (sql.slice(i, i + 2) === "$$") { inBody = !inBody; current += "$$"; i++; }
    else if (sql[i] === ";" && !inBody) { chunks.push(current); current = ""; }
    else current += sql[i];
  }
  if (current.trim()) chunks.push(current);
  return chunks.map(chunk => chunk.replace(/^\s*--.*$/gm, "").trim()).filter(chunk => chunk && !["BEGIN", "COMMIT"].includes(chunk));
}
const actor = { id: "test-manager", role: "MANAGER" as const, username: "test-manager", displayName: "Test Manager" };

async function savepointFailure(tx: Prisma.TransactionClient, run: () => Promise<unknown>, pattern: string) {
  await tx.$executeRawUnsafe("SAVEPOINT expected_failure");
  await expect(run()).rejects.toThrow(pattern);
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_failure");
}

describe("order item edit foundation with the real database", () => {
  afterAll(() => db.$disconnect());
  it("verifies migration, sticky Pack boundary, revision snapshots and protected history inside rollback", async () => {
    const marker = `ORDER-EDIT-FOUNDATION-${Date.now()}`;
    let verified = false;
    try {
      await db.$transaction(async tx => {
        const [schema] = await tx.$queryRaw<{ present: boolean }[]>`
          SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'pack_started_at') AS present
        `;
        // Before deployment this trial applies the full DDL and backfill, then
        // rolls it back. Once deployed it verifies the same live invariants.
        if (!schema.present) for (const sql of sqlStatements(migration)) await tx.$executeRawUnsafe(sql);
        const customer = await tx.customer.create({ data: {
          name: marker, companyName: marker, address: "Test destination", phone: "", email: "", customerSegment: "Retail",
        } });
        const createOrder = (suffix: string) => tx.salesOrder.create({ data: {
          orderNumber: `${marker}-${suffix}`, customerId: customer.id, createdByUserId: actor.id,
          deliveryDestinationSnapshot: customer.address, orderDate: new Date(), status: "Confirmed",
          subtotal: 100, total: 100, netSalesAmount: 100,
          items: { create: { itemName: "Test product", quantity: 1, finalUnitPrice: 100, subtotal: 100 } },
        }, include: { items: true } });

        const order = await createOrder("revision");
        const before = await lockOrderItemEditContext(tx, order.id, actor, order.version);
        expect(before.revisionNumber).toBe(1);
        await expect(lockOrderItemEditContext(tx, order.id, actor, 999)).rejects.toMatchObject({ code: "STALE_VERSION" });
        await expect(lockOrderItemEditContext(tx, order.id, { id: "other-sales", role: "SALES" }, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await tx.salesOrderItem.update({ where: { id: order.items[0].id }, data: { quantity: 2, subtotal: 200 } });
        await tx.salesOrder.update({ where: { id: order.id }, data: {
          subtotal: 200, total: 200, netSalesAmount: 200, revisionNumber: 2, version: { increment: 1 },
        } });
        const after = (await loadOrderItemEditContext(order.id, actor, tx)).order!;
        expect(() => buildOrderItemRevisionData({ actor, before, after, reason: " " })).toThrow("A reason is required");
        expect(() => buildOrderItemRevisionData({ actor, before, after: { ...after, customerId: "forged" }, reason: "Correction" })).toThrow("cannot change document identity");
        const revision = await persistOrderItemRevision(tx, { actor, before, after, reason: "Correct ordered quantity" });
        expect(revision).toMatchObject({ revisionNumber: 2, actorUserId: actor.id, reason: "Correct ordered quantity", invoiceId: null });
        expect(revision.beforeSnapshot).toMatchObject({ revisionNumber: 1, items: [expect.objectContaining({ quantity: 1 })] });
        expect(revision.afterSnapshot).toMatchObject({ revisionNumber: 2, items: [expect.objectContaining({ quantity: 2 })] });
        expect(await tx.auditTrail.count({ where: { entityId: order.id, action: "ITEMS_REVISED" } })).toBe(1);
        await savepointFailure(tx, () => tx.salesOrderItemRevision.update({ where: { id: revision.id }, data: { reason: "rewrite" } }), "append-only");
        await savepointFailure(tx, () => tx.salesOrderItemRevision.delete({ where: { id: revision.id } }), "append-only");
        await savepointFailure(tx, () => persistOrderItemRevision(tx, { actor, before, after, reason: "Duplicate" }), "Unique constraint");
        await savepointFailure(tx, () => tx.salesOrder.update({ where: { id: order.id }, data: { revisionNumber: 1 } }), "cannot decrease");

        const invoicedOrder = await createOrder("invoice-revision");
        const invoice = await tx.invoice.create({ data: {
          invoiceNumber: `INV-${marker}`, salesOrderId: invoicedOrder.id, customerId: customer.id,
          issueDate: new Date(), dueDate: new Date(), totalAmount: 100, netSalesAmount: 100, remainingAmount: 100,
        } });
        await tx.salesOrder.update({ where: { id: invoicedOrder.id }, data: { status: "Invoiced" } });
        const invoiceBefore = await lockOrderItemEditContext(tx, invoicedOrder.id, actor, invoicedOrder.version);
        await tx.salesOrderItem.update({ where: { id: invoicedOrder.items[0].id }, data: { quantity: 2, subtotal: 200 } });
        await tx.salesOrder.update({ where: { id: invoicedOrder.id }, data: {
          subtotal: 200, total: 200, netSalesAmount: 200, revisionNumber: 2, version: { increment: 1 },
        } });
        await tx.invoice.update({ where: { id: invoice.id }, data: {
          totalAmount: 200, netSalesAmount: 200, remainingAmount: 200, revisionNumber: 2, version: { increment: 1 },
          itemsSnapshot: [{ itemName: "Test product", quantity: 2, finalUnitPrice: 100, subtotal: 200 }],
        } });
        const invoiceAfter = (await loadOrderItemEditContext(invoicedOrder.id, actor, tx)).order!;
        const invoiceRevision = await persistOrderItemRevision(tx, { actor, before: invoiceBefore, after: invoiceAfter, reason: "Correct invoice item quantity" });
        expect(invoiceRevision).toMatchObject({ revisionNumber: 2, invoiceId: invoice.id, invoiceRevisionNumber: 2 });
        expect(invoiceRevision.beforeSnapshot).toMatchObject({ invoice: expect.objectContaining({ totalAmount: 100, revisionNumber: 1 }) });
        expect(invoiceRevision.afterSnapshot).toMatchObject({ invoice: expect.objectContaining({ totalAmount: 200, revisionNumber: 2 }) });
        await savepointFailure(tx, () => tx.invoice.update({ where: { id: invoice.id }, data: { revisionNumber: 1 } }), "Invoice revision numbers cannot decrease");

        const packedOrder = await createOrder("pack");
        const list = await tx.pickingList.create({ data: {
          pickingListNumber: `PL-${marker}`, salesOrderId: packedOrder.id, pickerName: "PIC", usesChecklist: true,
          items: { create: { salesOrderItemId: packedOrder.items[0].id, itemName: "Test product", orderedQuantity: 1 } },
        } });
        expect((await tx.salesOrder.findUniqueOrThrow({ where: { id: packedOrder.id } })).packStartedAt).toBeNull();
        await tx.pickingList.update({ where: { id: list.id }, data: { status: "InProgress" } });
        const started = await tx.salesOrder.findUniqueOrThrow({ where: { id: packedOrder.id } });
        expect(started.packStartedAt).toBeInstanceOf(Date);
        expect(started.version).toBe(packedOrder.version + 1);
        // Simulate an even stronger reset than Reopen: current status returns
        // to Pick, but the irreversible parent boundary remains set.
        await tx.pickingList.update({ where: { id: list.id }, data: { status: "Pending", packedAt: null } });
        const reset = await loadOrderItemEditContext(packedOrder.id, actor, tx);
        expect(reset.order?.packStartedAt).toEqual(started.packStartedAt);
        expect(reset.eligibility.code).toBe("PACK_STARTED");
        await savepointFailure(tx, () => tx.salesOrder.update({ where: { id: packedOrder.id }, data: { packStartedAt: null } }), "permanent order item edit boundary");

        const historyOrder = await createOrder("historical");
        const historicalList = await tx.pickingList.create({ data: {
          pickingListNumber: `PL-HISTORY-${marker}`, salesOrderId: historyOrder.id, pickerName: "PIC",
        } });
        await tx.auditTrail.create({ data: {
          actorUsername: "system", actorRole: "System", moduleName: "Pick & Pack", entityType: "PICKING_LIST",
          entityId: historicalList.id, recordReference: historicalList.pickingListNumber, action: "REOPENED",
          changeSummary: "Historical reset", oldValue: '{"status":"Packed"}', newValue: '{"status":"Pending"}',
        } });
        const backfill = migration.slice(migration.indexOf("WITH evidence AS"), migration.indexOf("CREATE FUNCTION public.remember_order_pack_start"));
        await tx.$executeRawUnsafe(backfill);
        expect((await loadOrderItemEditContext(historyOrder.id, actor, tx)).eligibility.code).toBe("PACK_STARTED");

        const protectedTables = await tx.$queryRaw<{ protected: boolean; anonymous_write: boolean }[]>`
          SELECT c.relrowsecurity AS protected, has_table_privilege('anon', c.oid, 'INSERT') AS anonymous_write
          FROM pg_class c WHERE c.oid = 'public.sales_order_item_revisions'::regclass
        `;
        expect(protectedTables[0]).toEqual({ protected: true, anonymous_write: false });
        verified = true;
        throw new Error("ROLLBACK_ORDER_ITEM_EDIT_FOUNDATION");
      }, { timeout: 90000 });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ROLLBACK_ORDER_ITEM_EDIT_FOUNDATION") throw error;
    }
    expect(verified).toBe(true);
    expect(await db.customer.count({ where: { name: marker } })).toBe(0);
  }, 100000);
});
