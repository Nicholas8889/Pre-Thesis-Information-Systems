import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const prisma = new PrismaClient();

describe("Batch 4 picking-list database constraints", () => {
  afterAll(() => prisma.$disconnect());

  it("enforces package count and picking status as one database invariant", async () => {
    const marker = `BATCH4-CONSTRAINT-${Date.now()}`;
    let customerId: string | undefined;
    let orderId: string | undefined;
    let pickingListId: string | undefined;

    try {
      const constraint = await prisma.$queryRaw<Array<{ convalidated: boolean }>>`
        SELECT convalidated
        FROM pg_constraint
        WHERE conname = 'picking_lists_package_count_lifecycle_check'
      `;
      expect(constraint).toEqual([{ convalidated: false }]);

      const customer = await prisma.customer.create({
        data: {
          name: marker,
          companyName: marker,
          phone: "",
          email: "",
          address: "Batch 4 constraint test",
          customerSegment: "Retail",
        },
      });
      customerId = customer.id;

      const order = await prisma.salesOrder.create({
        data: {
          orderNumber: marker,
          customerId,
          deliveryDestinationSnapshot: customer.address,
          orderDate: new Date(),
          subtotal: 0,
          total: 0,
        },
      });
      orderId = order.id;

      const pickingList = await prisma.pickingList.create({
        data: {
          pickingListNumber: marker,
          salesOrderId: orderId,
        },
      });
      pickingListId = pickingList.id;

      await expect(
        prisma.pickingList.update({
          where: { id: pickingListId },
          data: { status: "Packed", packageCount: null },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.pickingList.update({
          where: { id: pickingListId },
          data: { status: "Pending", packageCount: 1 },
        }),
      ).rejects.toThrow();
      expect(await prisma.pickingList.findUniqueOrThrow({ where: { id: pickingListId } }))
        .toMatchObject({ status: "Pending", packageCount: null });

      const packed = await prisma.pickingList.update({
        where: { id: pickingListId },
        data: { status: "Packed", packageCount: 1 },
      });
      expect(packed).toMatchObject({ status: "Packed", packageCount: 1 });

      await expect(
        prisma.pickingList.update({
          where: { id: pickingListId },
          data: { packageCount: 0 },
        }),
      ).rejects.toThrow();

      const reopened = await prisma.pickingList.update({
        where: { id: pickingListId },
        data: { status: "InProgress", packageCount: null },
      });
      expect(reopened).toMatchObject({ status: "InProgress", packageCount: null });
    } finally {
      if (pickingListId) {
        await prisma.pickingList.deleteMany({ where: { id: pickingListId } });
      }
      if (orderId) {
        await prisma.salesOrder.deleteMany({ where: { id: orderId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
    }
  }, 20_000);
});
