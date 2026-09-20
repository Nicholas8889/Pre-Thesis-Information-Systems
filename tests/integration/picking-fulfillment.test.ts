import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { customerInvoiceBalanceSelect } from "../../src/lib/customer-payment-query";
import { getCustomerPaymentSummary } from "../../src/lib/customer-intelligence";

const context = vi.hoisted(() => ({
  tx: null as Prisma.TransactionClient | null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: async () => ({ id: "test-admin", username: "admin", displayName: "Test Admin", role: "ADMIN" }),
}));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: vi.fn() }));
vi.mock("@/lib/customer-inquiry-lifecycle", () => ({
  completeCustomerInquiryForDeliveredOrder: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        const tx = context.tx;
        if (!tx) throw new Error("Missing test transaction");
        if (key === "$transaction")
          return async (
            work: (client: Prisma.TransactionClient) => Promise<unknown>,
          ) => work(tx);
        return Reflect.get(tx, key);
      },
    },
  ),
}));

import {
  createPickingList,
  reopenPickingList,
  savePickingList,
} from "../../src/lib/picking-list-actions";
import {
  createDeliveryNote,
  saveDeliveryNoteDraft,
  updateDeliveryNoteStatus,
} from "../../src/lib/actions";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_PICKING_FULFILLMENT";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Picking List to Delivered with the real database", () => {
  afterAll(() => prisma.$disconnect());

  it.each(
    (["DIRECT", "CUSTOMER_PO"] as const).flatMap(source => [
      { source, paymentTermType: "CREDIT" as const, paidAmount: 0 },
      { source, paymentTermType: "IMMEDIATE" as const, paidAmount: 0 },
      { source, paymentTermType: "IMMEDIATE" as const, paidAmount: 400 }
    ])
  )(
    "verifies packing and delivers $source / $paymentTermType with $paidAmount paid",
    async ({ source, paymentTermType, paidAmount }) => {
      const marker = `PICK-TEST-${Date.now()}-${source}`;
      let customerId = "";
      await expect(
        prisma.$transaction(
          async (tx) => {
            context.tx = tx;
            const customer = await tx.customer.create({
              data: {
                name: marker,
                companyName: marker,
                phone: "",
                email: "",
                address: "Test destination",
                customerSegment: "Retail",
              },
            });
            customerId = customer.id;
            const order = await tx.salesOrder.create({
              data: {
                orderNumber: marker,
                source,
                customerPoNumber:
                  source === "CUSTOMER_PO" ? `PO-${marker}` : null,
                customerId,
                orderDate: new Date(),
                status: "Invoiced",
                approvalStatus: "Approved",
                subtotal: 1000,
                total: 1000,
                paymentTermType,
                creditTermMonths: paymentTermType === "CREDIT" ? 1 : null,
                items: {
                  create: [
                    {
                      itemName: "Test product A",
                      quantity: 8,
                      finalUnitPrice: 100,
                      subtotal: 800,
                    },
                    {
                      itemName: "Test product B",
                      quantity: 2,
                      finalUnitPrice: 100,
                      subtotal: 200,
                    },
                  ],
                },
              },
            });
            const invoice = await tx.invoice.create({
              data: {
                invoiceNumber: `INV-${marker}`,
                salesOrderId: order.id,
                customerId,
                issueDate: new Date(),
                dueDate: paymentTermType === "IMMEDIATE" ? new Date() : new Date("2099-12-31"),
                totalAmount: 1000,
                paidAmount,
                remainingAmount: 1000 - paidAmount,
                paymentTermType,
                status: paidAmount > 0 ? "Partial" : "Unpaid",
                payments: paidAmount > 0 ? { create: { amount: paidAmount, paymentDate: new Date(), paymentMethod: "BankTransfer" } } : undefined,
              },
            });
            const summary = async () =>
              getCustomerPaymentSummary(
                await tx.customer.findUniqueOrThrow({
                  where: { id: customerId },
                  include: {
                    invoices: { select: customerInvoiceBalanceSelect },
                  },
                }),
              );
            await expect(
              createDeliveryNote(
                form({ invoiceId: invoice.id, salesOrderId: order.id }),
              ),
            ).rejects.toThrow("Create%20and%20complete%20a%20Picking%20List");
            expect(
              await tx.deliveryNote.count({
                where: { salesOrderId: order.id },
              }),
            ).toBe(0);
            await expect(
              createPickingList(form({ salesOrderId: order.id })),
            ).rejects.toThrow("Picking+PIC+is+required");
            await expect(
              createPickingList(
                form({ salesOrderId: order.id, pickerName: "Picking PIC Test" }),
              ),
            ).rejects.toThrow("success=Picking%20List%20created");
            let list = await tx.pickingList.findUniqueOrThrow({
              where: { salesOrderId: order.id },
              include: { items: true },
            });
            await expect(
              createDeliveryNote(form({ pickingListId: list.id })),
            ).rejects.toThrow("Picking%20List%20is%20not%20ready");
            const progressForm = (
              complete: boolean,
              full: boolean,
              withShortage = false,
            ) =>
              form({
                id: list.id,
                version: list.updatedAt.toISOString(),
                intent: complete ? "complete" : "save",
                pickerName: "Picking PIC Test",
                packerName: complete ? "Packing PIC Test" : "",
                ...Object.fromEntries(
                  list.items.flatMap((item) => {
                    const available =
                      full && withShortage && item.itemName === "Test product A"
                        ? item.orderedQuantity - 1
                        : full
                          ? item.orderedQuantity
                          : 0;
                    const availabilityStatus = !full
                      ? "Unchecked"
                      : available === item.orderedQuantity
                        ? "Available"
                        : "Partial";
                    return [
                      [`availability_${item.id}`, availabilityStatus],
                      [`available_${item.id}`, String(available)],
                      [`packed_${item.id}`, String(available)],
                      [
                        `notes_${item.id}`,
                        available < item.orderedQuantity && full
                          ? "One unit unavailable"
                          : "",
                      ],
                    ];
                  }),
                ),
              });
            await expect(
              savePickingList(progressForm(true, false)),
            ).rejects.toThrow("Review+every+item");
            const staleForm = progressForm(true, true);
            await expect(
              savePickingList(progressForm(false, false)),
            ).rejects.toThrow("success=Pick%20%26%20Pack%20progress%20saved");
            await expect(savePickingList(staleForm)).rejects.toThrow(
              "This+Picking+List+changed",
            );
            list = await tx.pickingList.findUniqueOrThrow({
              where: { id: list.id },
              include: { items: true },
            });
            expect(list.status).toBe("InProgress");
            const missingPackingPic = progressForm(true, true);
            missingPackingPic.set("packerName", "");
            await expect(savePickingList(missingPackingPic)).rejects.toThrow(
              "Review+every+item",
            );
            await expect(
              savePickingList(progressForm(true, true)),
            ).rejects.toThrow("success=Pick%20%26%20Pack%20completed");
            list = await tx.pickingList.findUniqueOrThrow({
              where: { id: list.id },
              include: { items: true },
            });
            expect(list).toMatchObject({
              status: "Packed",
              pickerName: "Picking PIC Test",
              packerName: "Packing PIC Test",
            });
            expect(list.packedAt).not.toBeNull();
            expect(await summary()).toMatchObject({
              paymentStatus: "Clean",
              outstandingAmount: 0,
            });
            await expect(
              reopenPickingList(
                form({
                  id: list.id,
                  version: list.updatedAt.toISOString(),
                }),
              ),
            ).rejects.toThrow("A+reason+is+required+to+reopen");
            await expect(
              reopenPickingList(
                form({
                  id: list.id,
                  version: list.updatedAt.toISOString(),
                  confirmationNote: "Correct completed quantities",
                }),
              ),
            ).rejects.toThrow("success=Picking%20List%20reopened");
            list = await tx.pickingList.findUniqueOrThrow({
              where: { id: list.id },
              include: { items: true },
            });
            expect(list.status).toBe("InProgress");
            expect(list.packedAt).toBeNull();
            await expect(
              savePickingList(progressForm(true, true, true)),
            ).rejects.toThrow("success=Pick%20%26%20Pack%20completed");
            list = await tx.pickingList.findUniqueOrThrow({
              where: { id: list.id },
              include: { items: true },
            });
            expect(list).toMatchObject({
              status: "Packed",
              pickerName: "Picking PIC Test",
              packerName: "Packing PIC Test",
            });
            expect(list.packedAt).not.toBeNull();
            await expect(
              savePickingList(progressForm(false, true)),
            ).rejects.toThrow("can+no+longer+be+edited");

            const deliveryForm = form({
              pickingListId: list.id,
              recipientName: customer.name,
              recipientAddress: customer.address,
              deliveryDate: "2026-09-12",
              driverName: "Budi Santoso",
              vehiclePlateNumber: "B 1234 TJK",
              customerId: "tampered-customer",
              invoiceId: "tampered-invoice",
              items: JSON.stringify([{ itemName: "Tampered", quantity: 999 }]),
            });
            await expect(createDeliveryNote(deliveryForm)).rejects.toThrow(
              "REDIRECT:/surat-jalan?tab=open",
            );
            const note = await tx.deliveryNote.findUniqueOrThrow({
              where: { pickingListId: list.id },
              include: { items: true },
            });
            expect(note).toMatchObject({
              status: "Draft",
              customerId,
              invoiceId: invoice.id,
              salesOrderId: order.id,
            });
            await expect(
              reopenPickingList(
                form({
                  id: list.id,
                  version: list.updatedAt.toISOString(),
                  confirmationNote: "Should not reopen after delivery",
                }),
              ),
            ).rejects.toThrow(
              "Picking+Lists+linked+to+Surat+Jalan+cannot+be+reopened",
            );
            expect(
              note.items.map((item) => [item.itemName, item.quantity]).sort(),
            ).toEqual([
              ["Test product A", 7],
              ["Test product B", 2],
            ]);
            const issueData = form({
              id: note.id,
              version: note.updatedAt.toISOString(),
              intent: "issue",
              recipientName: note.recipientName,
              recipientPhone: note.recipientPhone,
              recipientAddress: note.recipientAddress,
              deliveryDate: "2026-09-12",
              driverName: note.driverName!,
              vehiclePlateNumber: note.vehiclePlateNumber!,
            });
            for (const item of note.items) {
              issueData.set("quantity_" + item.id, item.itemName === "Test product A" ? "6" : "2");
            }
            await expect(saveDeliveryNoteDraft(issueData)).rejects.toThrow("issued%20and%20locked");
            const issuedNote = await tx.deliveryNote.findUniqueOrThrow({
              where: { id: note.id },
              include: { items: true },
            });
            expect(issuedNote.status).toBe("Issued");
            expect(issuedNote.items.map(item => [item.itemName, item.outstandingQuantity]).sort()).toEqual([
              ["Test product A", 2],
              ["Test product B", 0],
            ]);
            await expect(saveDeliveryNoteDraft(issueData)).rejects.toThrow(
              "Issued%20Surat%20Jalan%20is%20locked",
            );
            await expect(createDeliveryNote(deliveryForm)).rejects.toThrow(
              "Picking%20List%20is%20not%20ready",
            );
            expect(
              await tx.deliveryNote.count({
                where: { pickingListId: list.id },
              }),
            ).toBe(1);
            expect(await summary()).toMatchObject({
              paymentStatus: "Clean",
              outstandingAmount: 0,
            });
            await expect(
              updateDeliveryNoteStatus(
                form({ id: note.id, status: "Delivered" }),
              ),
            ).rejects.toThrow("tab=completed");
            expect(await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({
              paidAmount,
              remainingAmount: 1000 - paidAmount,
              status: paidAmount > 0 ? "Partial" : "Unpaid"
            });
            expect(await summary()).toMatchObject({
              paymentStatus: "Outstanding Payment",
              outstandingAmount: 1000 - paidAmount,
              openInvoiceCount: 1,
            });
            await expect(
              updateDeliveryNoteStatus(form({ id: note.id, status: "Issued" })),
            ).rejects.toThrow("Invalid%20Surat%20Jalan%20status%20transition");
            throw new Error(ROLLBACK);
          },
          { timeout: 45000 },
        ),
      ).rejects.toThrow(ROLLBACK);
      context.tx = null;
      expect(
        await prisma.customer.findUnique({ where: { id: customerId } }),
      ).toBeNull();
    },
    60000,
  );
});
