import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const db = new PrismaClient();
const migration = readFileSync("prisma/migrations/20261005010000_transition_active_pick_pack_checklists/migration.sql", "utf8")
  .split(";").map(sql => sql.trim()).filter(sql => sql && !["BEGIN", "COMMIT"].includes(sql));

describe("active legacy Pick & Pack migration", () => {
  afterAll(() => db.$disconnect());
  it("audits active transitions and leaves completed, linked and existing checklist sheets unchanged", async () => {
    const marker = `CHECKLIST-MIGRATION-${Date.now()}`;
    let verified = false;
    try {
      await db.$transaction(async tx => {
        const customer = await tx.customer.create({ data: {
          name: marker, companyName: marker, phone: "", email: "", address: "Test destination", customerSegment: "Retail",
        } });
        const records = [];
        for (const kind of ["pending", "progress", "completed", "linked", "checklist"] as const) {
          const order = await tx.salesOrder.create({ data: {
            orderNumber: `${marker}-${kind}`, customerId: customer.id, orderDate: new Date(),
            status: "Invoiced", approvalStatus: "Approved", deliveryDestinationSnapshot: customer.address,
            subtotal: 100, total: 100, netSalesAmount: 100,
            items: { create: { itemName: "Migration product", quantity: 10, finalUnitPrice: 10, subtotal: 100 } },
          }, include: { items: true } });
          const invoice = await tx.invoice.create({ data: {
            invoiceNumber: `INV-${marker}-${kind}`, salesOrderId: order.id, customerId: customer.id,
            issueDate: new Date(), dueDate: new Date(), totalAmount: 100, netSalesAmount: 100, remainingAmount: 100,
          } });
          const list = await tx.pickingList.create({ data: {
            pickingListNumber: `PL-${marker}-${kind}`, salesOrderId: order.id,
            status: kind === "completed" ? "Packed" : kind === "pending" ? "Pending" : "InProgress",
            usesChecklist: kind === "checklist", pickerName: kind === "pending" ? null : "Original Picker",
            packerName: "Original Packer", packageCount: kind === "completed" ? 1 : null,
            packedAt: kind === "completed" ? new Date() : null,
            items: { create: {
              salesOrderItemId: order.items[0].id, itemName: "Migration product", orderedQuantity: 10,
              availableQuantity: 6, packedQuantity: 6, availabilityStatus: "Partial", notes: "Historical progress note", isChecked: true,
            } },
          }, include: { items: true } });
          if (kind === "linked") {
            await tx.deliveryNote.create({ data: {
              deliveryNoteNumber: `SJ-${marker}`, pickingListId: list.id, salesOrderId: order.id, invoiceId: invoice.id,
              customerId: customer.id, recipientName: marker, recipientPhone: "", recipientAddress: customer.address,
              deliveryDate: new Date(), status: "Draft",
            } });
          }
          records.push({ kind, list });
        }
        for (const sql of migration) await tx.$executeRawUnsafe(sql);
        for (const { kind, list } of records) {
          const after = await tx.pickingList.findUniqueOrThrow({ where: { id: list.id }, include: { items: true } });
          const audits = await tx.auditTrail.findMany({ where: { entityId: list.id, action: "CHECKLIST_MIGRATED" } });
          if (kind === "pending" || kind === "progress") {
            expect(after.usesChecklist).toBe(true);
            expect(after.status).toBe(list.status);
            expect(after.pickerName).toBe(kind === "pending" ? "Original Packer" : "Original Picker");
            expect(after.packerName).toBeNull();
            expect(after.items[0]).toMatchObject({ isChecked: false, availableQuantity: 6, packedQuantity: 6, notes: "Historical progress note" });
            expect(after.updatedAt.toISOString()).not.toBe(list.updatedAt.toISOString());
            expect(audits).toHaveLength(1);
            expect(JSON.parse(audits[0].oldValue!)).toMatchObject({ uses_checklist: false, packer_name: "Original Packer" });
            expect(JSON.parse(audits[0].newValue!)).toMatchObject({ uses_checklist: true, packer_name: null });
          } else {
            expect(after).toEqual(list);
            expect(audits).toHaveLength(0);
          }
        }
        verified = true;
        throw new Error("ROLLBACK_CHECKLIST_MIGRATION");
      }, { timeout: 90000 });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ROLLBACK_CHECKLIST_MIGRATION") throw error;
    }
    expect(verified).toBe(true);
    expect(await db.customer.count({ where: { name: marker } })).toBe(0);
  }, 100000);
});
