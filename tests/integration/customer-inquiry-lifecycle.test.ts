import { describe, expect, it } from "vitest";
import { completeCustomerInquiryForDeliveredOrder } from "../../src/lib/customer-inquiry-lifecycle";
import { prisma } from "../../src/lib/prisma";

describe("customer inquiry lifecycle integration", () => {
  it(
    "keeps multi-item inquiries linked through SO and PO conversion, then completes on delivery",
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
            customerType: "Test"
          }
        });
        const product = await tx.product.create({
          data: { productName: `Inquiry Product ${marker}`, basePrice: 30_000 }
        });

        for (const conversion of [
          { status: "ConvertedToSO" as const, transactionType: "SALES_ORDER" as const },
          { status: "ConvertedToPO" as const, transactionType: "PRE_ORDER" as const }
        ]) {
          const inquiry = await tx.customerInquiry.create({
            data: {
              inquiryNumber: `TEST-INQ-${conversion.transactionType}-${marker}`,
              customerId: customer.id,
              items: {
                create: [
                  { productId: product.id, itemName: product.productName, quantity: 2, agreedPrice: 30_000 },
                  { productId: product.id, itemName: `${product.productName} second`, quantity: 3, agreedPrice: 30_000 }
                ]
              }
            },
            include: { items: true }
          });
          expect(inquiry.items).toHaveLength(2);

          const order = await tx.salesOrder.create({
            data: {
              orderNumber: `TEST-${conversion.transactionType}-${marker}`,
              transactionType: conversion.transactionType,
              customerId: customer.id,
              orderDate: new Date(),
              status: "Invoiced",
              subtotal: 150_000,
              total: 150_000,
              items: {
                create: [
                  { productId: product.id, itemName: product.productName, quantity: 2, unitPrice: 30_000, subtotal: 60_000 },
                  { productId: product.id, itemName: `${product.productName} second`, quantity: 3, unitPrice: 30_000, subtotal: 90_000 }
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
              deliveryNoteNumber: `TEST-SJ-${conversion.transactionType}-${marker}`,
              salesOrderId: order.id,
              customerId: customer.id,
              recipientName: customer.name,
              recipientPhone: customer.phone,
              recipientAddress: customer.address,
              deliveryDate: new Date(),
              status: "Issued",
              items: {
                create: [
                  { itemName: product.productName, quantity: 2, unit: "PCS" },
                  { itemName: `${product.productName} second`, quantity: 3, unit: "PCS" }
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
