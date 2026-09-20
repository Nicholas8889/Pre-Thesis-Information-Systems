import { describe, expect, it } from "vitest";
import { completeCustomerInquiryForDeliveredOrder } from "../../src/lib/customer-inquiry-lifecycle";
import { prisma } from "../../src/lib/prisma";

describe("customer inquiry lifecycle integration", () => {
  it(
    "keeps multi-item inquiries linked through Sales Order and Customer PO conversion, then completes on delivery",
    async () => {
      const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await expect(
        prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: "Inquiry QA",
            companyName: `Inquiry QA ${marker}`,
            phone: "-",
            email: "",
            address: "Test",
            customerSegment: "Test"
          }
        });
        const product = await tx.product.create({
          data: { productName: `Inquiry Product ${marker}`, listPrice: 30_000 }
        });

        for (const conversion of [
          { status: "ConvertedToSO" as const, source: "DIRECT" as const },
          { status: "ConvertedToCustomerPO" as const, source: "CUSTOMER_PO" as const }
        ]) {
          const inquiry = await tx.customerInquiry.create({
            data: {
              inquiryNumber: `TEST-INQ-${conversion.source}-${marker}`,
              customerId: customer.id,
              items: {
                create: [
                  { productId: product.id, itemName: product.productName, quantity: 2, agreedUnitPrice: 30_000 },
                  { productId: product.id, itemName: `${product.productName} second`, quantity: 3, agreedUnitPrice: 30_000 }
                ]
              }
            },
            include: { items: true }
          });
          expect(inquiry.items).toHaveLength(2);

          const order = await tx.salesOrder.create({
            data: {
              orderNumber: `TEST-${conversion.source}-${marker}`,
              source: conversion.source,
              customerId: customer.id,
              orderDate: new Date(),
              status: "Invoiced",
              subtotal: 150_000,
              total: 150_000,
              items: {
                create: [
                  { productId: product.id, itemName: product.productName, quantity: 2, baseUnitPrice: 30_000, finalUnitPrice: 30_000, subtotal: 60_000 },
                  { productId: product.id, itemName: `${product.productName} second`, quantity: 3, baseUnitPrice: 30_000, finalUnitPrice: 30_000, subtotal: 90_000 }
                ]
              }
            }
          });

          await tx.customerInquiry.update({
            where: { id: inquiry.id },
            data: { salesOrderId: order.id, status: conversion.status }
          });

          const deliveryNote = await tx.deliveryNote.create({
            data: {
              deliveryNoteNumber: `TEST-SJ-${conversion.source}-${marker}`,
              salesOrderId: order.id,
              customerId: customer.id,
              recipientName: customer.name,
              recipientPhone: customer.phone,
              recipientAddress: customer.address,
              deliveryDate: new Date(),
              status: "Issued",
              items: {
                create: [
                  { itemName: product.productName, orderedQuantitySnapshot: 2, packedQuantitySnapshot: 2, quantity: 2, outstandingQuantity: 0, unit: "PCS" },
                  { itemName: `${product.productName} second`, orderedQuantitySnapshot: 3, packedQuantitySnapshot: 3, quantity: 3, outstandingQuantity: 0, unit: "PCS" }
                ]
              }
            }
          });
          await tx.deliveryNote.update({
            where: { id: deliveryNote.id },
            data: { status: "Delivered" }
          });

          const completed = await completeCustomerInquiryForDeliveredOrder(tx, order.id);
          expect(completed).toMatchObject({
            id: inquiry.id,
            status: "Done",
            statusNote: "Linked order delivery completed"
          });
        }

          throw new Error("ROLLBACK_CUSTOMER_INQUIRY_TEST");
        }, { maxWait: 10_000, timeout: 20_000 })
      ).rejects.toThrow("ROLLBACK_CUSTOMER_INQUIRY_TEST");
    },
    30_000
  );
});
