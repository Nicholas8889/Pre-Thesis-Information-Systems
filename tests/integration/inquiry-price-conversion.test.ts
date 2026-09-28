import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../src/lib/auth";

const actor = vi.hoisted(() => ({
  id: "",
  username: "",
  displayName: "SIT Inquiry Sales",
  role: "SALES" as const,
  status: "Active" as const,
  sessionVersion: 1
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }
}));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: vi.fn(async () => actor)
}));

import { createCustomerInquiry, createSalesOrder } from "../../src/lib/actions";

const prisma = new PrismaClient();

function conversionForm({
  customerId,
  inquiryId,
  productId,
  baseUnitPrice,
  idempotencyKey
}: {
  customerId: string;
  inquiryId: string;
  productId: string;
  baseUnitPrice: number;
  idempotencyKey: string;
}) {
  const data = new FormData();
  data.set("source", "DIRECT");
  data.set("customerId", customerId);
  data.set("inquiryId", inquiryId);
  data.set("idempotencyKey", idempotencyKey);
  data.set("paymentTermType", "IMMEDIATE");
  data.set("items", JSON.stringify([{
    productId,
    itemName: "Client value must not be trusted",
    quantity: 2,
    baseUnitPrice,
    markupPercent: 0,
    discountPercent: 0
  }]));
  return data;
}

describe("Customer Inquiry agreed-price conversion", () => {
  afterAll(() => prisma.$disconnect());

  it("uses blank agreed-price fallback, snapshots it immutably, and rejects zero/inactive products atomically", async () => {
    const marker = `sit_auth_batch3_inquiry_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        username: marker,
        displayName: marker,
        passwordHash: hashPassword("SIT-Inquiry-Password-123!"),
        role: "SALES",
        status: "Active"
      }
    });
    actor.id = user.id;
    actor.username = user.username;
    const customer = await prisma.customer.create({
      data: {
        name: marker,
        companyName: marker,
        phone: "-",
        email: "",
        address: "SIT only",
        customerSegment: "SIT",
        portfolioOwnerUserId: user.id
      }
    });
    const product = await prisma.product.create({
      data: {
        productName: marker,
        sku: `B3-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase(),
        listPrice: 30_000,
        status: "Active"
      }
    });
    const inquiries = await Promise.all([
      prisma.customerInquiry.create({
        data: {
          inquiryNumber: `INQ-B3-FALLBACK-${Date.now()}-${Math.random()}`,
          customerId: customer.id,
          items: { create: { productId: product.id, itemName: product.productName, quantity: 2, requestedUnitPrice: null, agreedUnitPrice: null } }
        }
      }),
      prisma.customerInquiry.create({
        data: {
          inquiryNumber: `INQ-B3-ZERO-${Date.now()}-${Math.random()}`,
          customerId: customer.id,
          items: { create: { productId: product.id, itemName: product.productName, quantity: 1, requestedUnitPrice: null, agreedUnitPrice: 0 } }
        }
      }),
      prisma.customerInquiry.create({
        data: {
          inquiryNumber: `INQ-B3-INACTIVE-${Date.now()}-${Math.random()}`,
          customerId: customer.id,
          items: { create: { productId: product.id, itemName: product.productName, quantity: 1, requestedUnitPrice: 30_000, agreedUnitPrice: null } }
        }
      })
    ]);
    const [fallbackInquiry, zeroInquiry, inactiveInquiry] = inquiries;
    const successfulKey = `${marker}-success`;
    const zeroKey = `${marker}-zero`;
    const inactiveKey = `${marker}-inactive`;

    try {
      for (const invalidAgreedPrice of [0, -1, "not-a-number"]) {
        const invalidInquiry = new FormData();
        invalidInquiry.set("customerId", customer.id);
        invalidInquiry.set("items", JSON.stringify([{
          productId: product.id,
          itemName: product.productName,
          quantity: 1,
          requestedUnitPrice: "",
          agreedUnitPrice: invalidAgreedPrice,
          notes: ""
        }]));
        await expect(createCustomerInquiry(invalidInquiry)).rejects.toThrow(
          "prices%20must%20be%20blank%20or%20positive%20whole%20numbers"
        );
      }
      expect(await prisma.customerInquiry.count({ where: { customerId: customer.id } })).toBe(3);

      await expect(createSalesOrder(conversionForm({
        customerId: customer.id,
        inquiryId: fallbackInquiry.id,
        productId: product.id,
        baseUnitPrice: 30_000,
        idempotencyKey: successfulKey
      }))).rejects.toThrow("success=Sales%20order%20created");

      const order = await prisma.salesOrder.findUniqueOrThrow({
        where: { idempotencyKey: successfulKey },
        include: { items: true }
      });
      expect(order.items).toHaveLength(1);
      expect(order.items[0]).toMatchObject({
        baseUnitPrice: 30_000,
        finalUnitPrice: 30_000,
        subtotal: 60_000
      });

      await prisma.product.update({
        where: { id: product.id },
        data: { listPrice: 45_000 }
      });
      const immutableItem = await prisma.salesOrderItem.findUniqueOrThrow({
        where: { id: order.items[0].id }
      });
      expect(immutableItem.baseUnitPrice).toBe(30_000);
      expect(immutableItem.finalUnitPrice).toBe(30_000);

      await expect(createSalesOrder(conversionForm({
        customerId: customer.id,
        inquiryId: zeroInquiry.id,
        productId: product.id,
        baseUnitPrice: 0,
        idempotencyKey: zeroKey
      }))).rejects.toThrow("conversion%20payload%20no%20longer%20matches");
      expect(await prisma.salesOrder.count({ where: { idempotencyKey: zeroKey } })).toBe(0);

      await prisma.product.update({ where: { id: product.id }, data: { status: "Inactive" } });
      await expect(createSalesOrder(conversionForm({
        customerId: customer.id,
        inquiryId: inactiveInquiry.id,
        productId: product.id,
        baseUnitPrice: 30_000,
        idempotencyKey: inactiveKey
      }))).rejects.toThrow("products%20are%20unavailable");
      expect(await prisma.salesOrder.count({ where: { idempotencyKey: inactiveKey } })).toBe(0);
      expect(await prisma.auditTrail.count({
        where: { entityId: { in: [zeroInquiry.id, inactiveInquiry.id] } }
      })).toBe(0);
    } finally {
      const orders = await prisma.salesOrder.findMany({
        where: { idempotencyKey: { in: [successfulKey, zeroKey, inactiveKey] } },
        select: { id: true }
      });
      await prisma.auditTrail.deleteMany({
        where: { entityId: { in: [...inquiries.map(inquiry => inquiry.id), ...orders.map(order => order.id)] } }
      });
      await prisma.customerInquiry.deleteMany({ where: { id: { in: inquiries.map(inquiry => inquiry.id) } } });
      await prisma.salesOrder.deleteMany({ where: { id: { in: orders.map(order => order.id) } } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 60_000);
});
