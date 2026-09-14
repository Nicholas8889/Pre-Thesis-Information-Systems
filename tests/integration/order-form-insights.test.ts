import { PrismaClient } from "@prisma/client";
import { customerInvoiceBalanceSelect } from "../../src/lib/customer-payment-query";
import { afterAll, describe, expect, it } from "vitest";
import {
  getCustomerPaymentBehaviour,
  getCustomerPaymentSummary,
  getJakartaTrailingTwelveMonthWindow
} from "../../src/lib/customer-intelligence";
import {
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "../../src/lib/product-insights";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_ORDER_FORM_INSIGHTS_TEST";

describe("order form insights integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("batch-loads customer and product history used by both order forms", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = `${Date.now()}${Math.floor(Math.random() * 1_000)}`
      .padStart(16, "0")
      .slice(-16);
    const now = new Date("2026-08-12T05:00:00.000Z");
    const customerHistoryWindow = getJakartaTrailingTwelveMonthWindow(now);
    const currentMonth = getJakartaCurrentMonthWindow(now);

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

        await tx.salesOrder.create({
          data: {
            orderNumber: `SO-INSIGHT-${marker}`,
            customerId: customer.id,
            orderDate: new Date("2026-08-05T05:00:00.000Z"),
            status: "Confirmed",
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

        const [loadedCustomers, loadedProducts] = await Promise.all([
          tx.customer.findMany({
            where: { id: customer.id },
            select: {
              id: true,
              npwp: true,
              salesOrders: {
                where: {
                  orderDate: {
                    gte: customerHistoryWindow.observationStart,
                    lte: customerHistoryWindow.observationEnd
                  }
                },
                select: {
                  orderDate: true,
                  status: true,
                  paymentTermType: true,
                  creditTermMonths: true
                }
              },
              invoices: {
                where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
                select: customerInvoiceBalanceSelect
              }
            }
          }),
          tx.product.findMany({
            where: { id: product.id },
            select: {
              id: true,
              salesOrderItems: {
                where: {
                  salesOrder: {
                    orderDate: {
                      gte: currentMonth.monthStart,
                      lt: currentMonth.nextMonthStart
                    },
                    status: { in: [...PRODUCT_AVERAGE_ELIGIBLE_STATUSES] }
                  }
                },
                select: {
                  productId: true,
                  quantity: true,
                  subtotal: true,
                  salesOrder: { select: { orderDate: true, status: true } }
                }
              }
            }
          })
        ]);

        const loadedCustomer = loadedCustomers[0];
        const loadedProduct = loadedProducts[0];
        expect(loadedCustomer).toBeDefined();
        expect(loadedProduct).toBeDefined();
        if (!loadedCustomer || !loadedProduct) {
          throw new Error("Insight fixture was not loaded");
        }

        expect(getCustomerPaymentSummary(loadedCustomer)).toEqual({ paymentStatus: "Clean", outstandingAmount: 0, openInvoiceCount: 0 });
        expect(getCustomerPaymentBehaviour(loadedCustomer, now)).toMatchObject({
          behaviour: "Immediate Payment",
          orderCount: 1,
          limitedHistory: true
        });
        expect(loadedCustomer.npwp).toBe(npwp);
        expect(
          getCurrentMonthAverageSoldPrice(
            product.id,
            loadedProduct.salesOrderItems,
            now
          )
        ).toMatchObject({
          averageSoldPrice: 110,
          eligibleQuantity: 2,
          eligibleSalesValue: 220,
          monthLabel: "August 2026"
        });

        throw new Error(ROLLBACK_MARKER);
      })
    ).rejects.toThrow(ROLLBACK_MARKER);
  });
});
