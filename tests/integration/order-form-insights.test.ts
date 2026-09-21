import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { loadOrderFormInsights } from "../../src/lib/order-form-insights";
import { formatNpwp } from "../../src/lib/npwp";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_ORDER_FORM_INSIGHTS_TEST";

describe("order form insights integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("loads shallow options with database-side customer and product aggregates", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = `${Date.now()}${Math.floor(Math.random() * 1_000)}`
      .padStart(16, "0")
      .slice(-16);
    const now = new Date("2026-08-12T05:00:00.000Z");

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Insight Customer ${marker}`,
            companyName: `Insight Company ${marker}`,
            npwp,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail",
            createdAt: new Date("2026-01-01T00:00:00.000Z")
          }
        });
        const product = await tx.product.create({
          data: {
            productName: `Insight Product ${marker}`,
            listPrice: 100
          }
        });

        const salesOrder = await tx.salesOrder.create({
          data: {
            orderNumber: `SO-INSIGHT-${marker}`,
            customerId: customer.id,
            orderDate: new Date("2026-08-05T05:00:00.000Z"),
            status: "Invoiced",
            subtotal: 220,
            total: 220,
            netSalesAmount: 220,
            paymentTermType: "IMMEDIATE",
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 2,
                baseUnitPrice: 110,
                finalUnitPrice: 110,
                subtotal: 220
              }
            }
          }
        });
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: `INV-INSIGHT-${marker}`,
            salesOrderId: salesOrder.id,
            customerId: customer.id,
            issueDate: new Date("2026-08-06T05:00:00.000Z"),
            dueDate: new Date("2026-08-10T05:00:00.000Z"),
            totalAmount: 220,
            remainingAmount: 220,
            netSalesAmount: 220,
            status: "Unpaid"
          }
        });
        await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-INSIGHT-${marker}`,
            invoiceId: invoice.id,
            salesOrderId: salesOrder.id,
            customerId: customer.id,
            recipientName: customer.name,
            recipientPhone: "",
            recipientAddress: "",
            deliveryDate: new Date("2026-08-07T05:00:00.000Z"),
            status: "Delivered"
          }
        });

        const insights = await loadOrderFormInsights(tx, now);
        const loadedCustomer = insights.customers.find(
          (candidate) => candidate.id === customer.id
        );
        const loadedProduct = insights.products.find(
          (candidate) => candidate.id === product.id
        );
        expect(loadedCustomer).toBeDefined();
        expect(loadedProduct).toBeDefined();
        if (!loadedCustomer || !loadedProduct) {
          throw new Error("Insight fixture was not loaded");
        }

        expect(loadedCustomer).toMatchObject({
          paymentStatus: "Outstanding Payment",
          outstandingAmount: 220,
          openInvoiceCount: 1,
          overdueInvoiceCount: 1
        });
        expect(loadedCustomer).not.toHaveProperty("paymentBehaviour");
        expect(loadedCustomer.npwp).toBe(formatNpwp(npwp));
        expect(loadedProduct).toMatchObject({
          averageSoldPrice: 110,
          averageEligibleQuantity: 2,
          averageMonthLabel: "August 2026"
        });

        throw new Error(ROLLBACK_MARKER);
      }, { timeout: 20_000 })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 25_000);
});
