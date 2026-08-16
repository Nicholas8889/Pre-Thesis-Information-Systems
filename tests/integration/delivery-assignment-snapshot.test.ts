import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_DELIVERY_ASSIGNMENT_SNAPSHOT_TEST";

describe("Surat Jalan delivery assignment snapshots", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists a selected driver and plate while keeping historical null records readable", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Delivery Customer ${marker}`,
            companyName: `Delivery Company ${marker}`,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });

        const assignedDeliveryNote = await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-ASSIGNED-${marker}`,
            customerId: customer.id,
            recipientName: customer.name,
            recipientPhone: customer.phone,
            recipientAddress: customer.address,
            deliveryDate: new Date("2026-08-12T05:00:00.000Z"),
            status: "Issued",
            driverName: "Budi Santoso",
            vehiclePlateNumber: "B 1234 TJK"
          }
        });

        const historicalDeliveryNote = await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-HISTORICAL-${marker}`,
            customerId: customer.id,
            recipientName: customer.name,
            recipientPhone: customer.phone,
            recipientAddress: customer.address,
            deliveryDate: new Date("2026-08-12T05:00:00.000Z"),
            status: "Issued"
          }
        });

        expect(assignedDeliveryNote).toMatchObject({
          driverName: "Budi Santoso",
          vehiclePlateNumber: "B 1234 TJK"
        });
        expect(historicalDeliveryNote).toMatchObject({
          driverName: null,
          vehiclePlateNumber: null
        });

        throw new Error(ROLLBACK_MARKER);
      })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 20_000);

  it("rejects a partially populated delivery assignment at the database boundary", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Delivery Constraint Customer ${marker}`,
            companyName: `Delivery Constraint Company ${marker}`,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });

        await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-PARTIAL-${marker}`,
            customerId: customer.id,
            recipientName: customer.name,
            recipientPhone: customer.phone,
            recipientAddress: customer.address,
            deliveryDate: new Date("2026-08-12T05:00:00.000Z"),
            status: "Issued",
            driverName: "Budi Santoso"
          }
        });
      })
    ).rejects.toThrow();
  }, 20_000);
});
