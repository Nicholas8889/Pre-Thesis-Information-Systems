import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "../../src/lib/product-insights";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_PRODUCT_AVERAGE_SOLD_PRICE_TEST";

describe("product average sold price integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("uses eligible SO and Customer PO item subtotals matched by product ID", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date("2026-08-12T05:00:00.000Z");

    await expect(
      prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            name: `Average Customer ${marker}`,
            companyName: `Average Company ${marker}`,
            phone: "",
            email: "",
            address: "",
            customerSegment: "Retail"
          }
        });
        const [product, otherProduct] = await Promise.all([
          tx.product.create({
            data: { productName: `Average Product ${marker}`, listPrice: 100 }
          }),
          tx.product.create({
            data: { productName: `Other Average Product ${marker}`, listPrice: 100 }
          })
        ]);
        const baseOrder = {
          customerId: customer.id,
          subtotal: 100_000,
          total: 100_000,
          netSalesAmount: 100_000
        };

        await tx.salesOrder.create({
          data: {
            ...baseOrder,
            orderNumber: `SO-AVG-${marker}-1`,
            orderDate: new Date("2026-08-01T05:00:00.000Z"),
            status: "Confirmed",
            items: {
              create: [
                {
                  productId: product.id,
                  itemName: product.productName,
                  quantity: 2,
                  baseUnitPrice: 110,
                  finalUnitPrice: 110,
                  subtotal: 220
                },
                {
                  productId: otherProduct.id,
                  itemName: product.productName,
                  quantity: 10,
                  baseUnitPrice: 1_000,
                  finalUnitPrice: 1_000,
                  subtotal: 10_000
                }
              ]
            }
          }
        });
        await tx.salesOrder.create({
          data: {
            ...baseOrder,
            orderNumber: `SO-AVG-${marker}-2`,
            customerPoNumber: `PO-AVG-${marker}-2`,
            source: "CUSTOMER_PO",
            orderDate: new Date("2026-08-02T05:00:00.000Z"),
            status: "Shipped",
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 3,
                baseUnitPrice: 90,
                finalUnitPrice: 90,
                subtotal: 270
              }
            }
          }
        });
        await tx.salesOrder.create({
          data: {
            ...baseOrder,
            orderNumber: `SO-AVG-${marker}-3`,
            orderDate: new Date("2026-08-03T05:00:00.000Z"),
            status: "Draft",
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 10,
                baseUnitPrice: 1,
                finalUnitPrice: 1,
                subtotal: 10
              }
            }
          }
        });
        await tx.salesOrder.create({
          data: {
            ...baseOrder,
            orderNumber: `SO-AVG-${marker}-4`,
            orderDate: new Date("2026-07-31T16:59:59.999Z"),
            status: "Invoiced",
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 10,
                baseUnitPrice: 1,
                finalUnitPrice: 1,
                subtotal: 10
              }
            }
          }
        });

        const currentMonth = getJakartaCurrentMonthWindow(now);
        const loadedProduct = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: {
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
        });
        const result = getCurrentMonthAverageSoldPrice(
          product.id,
          loadedProduct.salesOrderItems,
          now
        );

        expect(loadedProduct.salesOrderItems).toHaveLength(2);
        expect(result).toMatchObject({
          averageSoldPrice: 98,
          eligibleQuantity: 5,
          eligibleSalesValue: 490,
          monthLabel: "August 2026"
        });
        throw new Error(ROLLBACK_MARKER);
      })
    ).rejects.toThrow(ROLLBACK_MARKER);
  });
});
