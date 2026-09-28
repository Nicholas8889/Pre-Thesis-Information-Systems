import { describe, expect, it } from "vitest";
import { claimCustomerInquiryConversion } from "../../src/lib/customer-inquiry-conversion";
import { allocateDocumentNumber } from "../../src/lib/workflow";
import { prisma } from "../../src/lib/prisma";

describe("Batch 2 commercial integrity", () => {
  it("allocates unique non-reused document numbers under concurrency", async () => {
    const year = 9000 + Math.floor(Math.random() * 900);
    try {
      const numbers = await Promise.all([
        allocateDocumentNumber("SO", year),
        allocateDocumentNumber("SO", year),
        allocateDocumentNumber("SO", year)
      ]);
      expect(new Set(numbers).size).toBe(3);
      expect(numbers.map(number => Number(number.split("-").at(-1))).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      const fourth = await allocateDocumentNumber("SO", year);
      expect(fourth).toBe(`SO-${year}-004`);
    } finally {
      await prisma.documentSequence.deleteMany({ where: { documentType: "SO", year } });
    }
  });

  it("lets exactly one concurrent inquiry conversion commit a complete order", async () => {
    const marker = `sit_b2_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let inquiryId = "";
    let customerId = "";
    let productId = "";
    try {
      const customer = await prisma.customer.create({
        data: {
          name: marker,
          companyName: marker,
          phone: "-",
          email: "",
          address: "test",
          customerSegment: "SIT"
        }
      });
      customerId = customer.id;
      const product = await prisma.product.create({
        data: { sku: `SIT-${Date.now()}`, productName: marker, listPrice: 10_000 }
      });
      productId = product.id;
      const inquiry = await prisma.customerInquiry.create({
        data: {
          inquiryNumber: `SIT-INQ-${marker}`,
          customerId,
          items: {
            create: {
              productId,
              itemName: product.productName,
              productSkuSnapshot: product.sku,
              quantity: 2,
              agreedUnitPrice: 10_000
            }
          }
        }
      });
      inquiryId = inquiry.id;

      const attempts = await Promise.allSettled(["A", "B"].map(label =>
        prisma.$transaction(async tx => {
          const order = await tx.salesOrder.create({
            data: {
              orderNumber: `SIT-SO-${marker}-${label}`,
              idempotencyKey: `${marker}-${label}`,
              customerId,
              createdByUserId: null,
              orderDate: new Date(),
              status: "Confirmed",
              subtotal: 20_000,
              total: 20_000,
              netSalesAmount: 20_000,
              items: {
                create: {
                  productId,
                  itemName: product.productName,
                  productSkuSnapshot: product.sku,
                  quantity: 2,
                  baseUnitPrice: 10_000,
                  finalUnitPrice: 10_000,
                  subtotal: 20_000
                }
              }
            }
          });
          await claimCustomerInquiryConversion(tx, {
            inquiryId,
            salesOrderId: order.id,
            expectedUpdatedAt: inquiry.updatedAt,
            targetStatus: "ConvertedToSO"
          });
          return order.id;
        }, { timeout: 20_000 })
      ));

      expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
      const converted = await prisma.customerInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
      const orders = await prisma.salesOrder.findMany({
        where: { orderNumber: { startsWith: `SIT-SO-${marker}` } },
        include: { items: true }
      });
      expect(converted.status).toBe("ConvertedToSO");
      expect(orders).toHaveLength(1);
      expect(orders[0].items).toHaveLength(1);
      expect(converted.salesOrderId).toBe(orders[0].id);
    } finally {
      if (inquiryId) await prisma.customerInquiry.deleteMany({ where: { id: inquiryId } });
      if (customerId) await prisma.salesOrder.deleteMany({ where: { customerId } });
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  }, 30_000);

  it("keeps product snapshots readable after the master relation becomes null", async () => {
    const marker = `sit_b2_history_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const customer = await prisma.customer.create({
      data: { name: marker, companyName: marker, phone: "-", email: "", address: "test", customerSegment: "SIT" }
    });
    const product = await prisma.product.create({
      data: { sku: `HIST-${Date.now()}`, productName: "Historical Product", listPrice: 12_345 }
    });
    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `SIT-HISTORY-${marker}`,
        customerId: customer.id,
        orderDate: new Date(),
        status: "Confirmed",
        subtotal: 24_690,
        total: 24_690,
        netSalesAmount: 24_690,
        items: { create: {
          productId: product.id,
          itemName: product.productName,
          productSkuSnapshot: product.sku,
          quantity: 2,
          baseUnitPrice: 12_345,
          finalUnitPrice: 12_345,
          subtotal: 24_690
        } }
      }
    });
    try {
      await prisma.product.delete({ where: { id: product.id } });
      const item = await prisma.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: order.id } });
      expect(item).toMatchObject({
        productId: null,
        itemName: "Historical Product",
        productSkuSnapshot: product.sku,
        finalUnitPrice: 12_345
      });
    } finally {
      await prisma.salesOrder.deleteMany({ where: { id: order.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
    }
  });

  it("enforces quantity and amount checks at the database boundary", async () => {
    const marker = `sit_b2_check_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const customer = await prisma.customer.create({
      data: { name: marker, companyName: marker, phone: "-", email: "", address: "test", customerSegment: "SIT" }
    });
    try {
      await expect(prisma.salesOrder.create({
        data: {
          orderNumber: `SIT-CHECK-${marker}`,
          customerId: customer.id,
          orderDate: new Date(),
          subtotal: 0,
          total: 0,
          items: { create: { itemName: "Invalid", quantity: 0, finalUnitPrice: 0, subtotal: 0 } }
        }
      })).rejects.toThrow("sales_order_items_quantity_positive_check");
      expect(await prisma.salesOrder.count({ where: { orderNumber: `SIT-CHECK-${marker}` } })).toBe(0);

      await expect(prisma.salesOrder.create({
        data: {
          orderNumber: `SIT-CHECK-ITEM-AMOUNT-${marker}`,
          customerId: customer.id,
          orderDate: new Date(),
          subtotal: 0,
          total: 0,
          items: { create: { itemName: "Invalid", quantity: 1, baseUnitPrice: -1, finalUnitPrice: 0, subtotal: 0 } }
        }
      })).rejects.toThrow("sales_order_items_amounts_non_negative_check");
      expect(await prisma.salesOrder.count({ where: { orderNumber: `SIT-CHECK-ITEM-AMOUNT-${marker}` } })).toBe(0);

      await expect(prisma.salesOrder.create({
        data: {
          orderNumber: `SIT-CHECK-HEADER-AMOUNT-${marker}`,
          customerId: customer.id,
          orderDate: new Date(),
          subtotal: -1,
          total: -1,
          netSalesAmount: -1,
          items: { create: { itemName: "Valid line", quantity: 1, finalUnitPrice: 0, subtotal: 0 } }
        }
      })).rejects.toThrow("sales_orders_amounts_non_negative_check");
      expect(await prisma.salesOrder.count({ where: { orderNumber: `SIT-CHECK-HEADER-AMOUNT-${marker}` } })).toBe(0);
    } finally {
      await prisma.salesOrder.deleteMany({ where: { customerId: customer.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });

  it("enforces the Collection invoice/customer relation at the database boundary", async () => {
    const marker = `sit_b2_collection_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: { name: `${marker}-a`, companyName: `${marker}-a`, phone: "-", email: "", address: "A", customerSegment: "SIT" }
      }),
      prisma.customer.create({
        data: { name: `${marker}-b`, companyName: `${marker}-b`, phone: "-", email: "", address: "B", customerSegment: "SIT" }
      })
    ]);
    try {
      const order = await prisma.salesOrder.create({
        data: {
          orderNumber: `SIT-COLLECTION-${marker}`,
          customerId: customerB.id,
          deliveryDestinationSnapshot: customerB.address,
          orderDate: new Date(),
          subtotal: 1_000,
          total: 1_000,
          netSalesAmount: 1_000,
          items: { create: { itemName: "Valid", quantity: 1, finalUnitPrice: 1_000, subtotal: 1_000 } }
        }
      });
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${marker}`,
          salesOrderId: order.id,
          customerId: customerB.id,
          issueDate: new Date(),
          dueDate: new Date(),
          totalAmount: 1_000,
          remainingAmount: 1_000,
          netSalesAmount: 1_000
        }
      });
      await expect(prisma.collectionTask.create({
        data: {
          customerId: customerA.id,
          invoiceId: invoice.id,
          scheduledDate: new Date(),
          status: "Planned",
          notes: "Tampered cross-customer relation"
        }
      })).rejects.toThrow("collection_tasks_invoice_customer_id_fkey");
      expect(await prisma.collectionTask.count({ where: { invoiceId: invoice.id } })).toBe(0);
    } finally {
      await prisma.invoice.deleteMany({ where: { customerId: { in: [customerA.id, customerB.id] } } });
      await prisma.salesOrder.deleteMany({ where: { customerId: { in: [customerA.id, customerB.id] } } });
      await prisma.customer.deleteMany({ where: { id: { in: [customerA.id, customerB.id] } } });
    }
  });
});
