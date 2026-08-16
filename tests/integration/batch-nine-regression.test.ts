import { PrismaClient, type Customer } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { getCustomerPaymentBehaviour } from "../../src/lib/customer-intelligence";
import { validateDeliveryAssignment } from "../../src/lib/delivery-options";
import {
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow
} from "../../src/lib/product-insights";
import { buildOrderTaxSnapshot } from "../../src/lib/tax";

const prisma = new PrismaClient();
const ROLLBACK_MARKER = "ROLLBACK_BATCH_NINE_REGRESSION_TEST";

describe("Batch 9 cross-feature regression", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reconciles intelligence, product pricing, tax, invoice, and delivery snapshots", async () => {
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp = `${Date.now()}${Math.floor(Math.random() * 1_000)}`
      .padStart(16, "0")
      .slice(-16);
    const { monthStart } = getJakartaCurrentMonthWindow();
    const orderDate = new Date(
      Math.min(
        monthStart.getTime() + 2 * 24 * 60 * 60 * 1000,
        Date.now()
      )
    );

    await expect(
      prisma.$transaction(async (tx) => {
        const customerDefinitions = [
          { key: "immediate", npwp },
          { key: "short", npwp: null },
          { key: "long", npwp: null },
          { key: "mixed", npwp: null },
          { key: "none", npwp: null }
        ] as const;
        const customers = new Map<string, Customer>();

        for (const definition of customerDefinitions) {
          const customer = await tx.customer.create({
            data: {
              name: `Batch 9 ${definition.key} ${marker}`,
              companyName: `Batch 9 ${definition.key} Company ${marker}`,
              npwp: definition.npwp,
              phone: "",
              email: "",
              address: "",
              customerSegment: "Retail"
            }
          });
          customers.set(definition.key, customer);
        }

        const product = await tx.product.create({
          data: {
            productName: `Batch 9 Product ${marker}`,
            listPrice: 1_200_000
          }
        });
        const immediateCustomer = requireMapValue(customers, "immediate");
        const shortCustomer = requireMapValue(customers, "short");
        const taxSnapshot = buildOrderTaxSnapshot({
          totalAmount: 2_220_000,
          customerNpwp: immediateCustomer.npwp
        });
        const taxedOrder = await tx.salesOrder.create({
          data: {
            orderNumber: `SO-B9-TAX-${marker}`,
            customerId: immediateCustomer.id,
            orderDate,
            status: "Confirmed",
            subtotal: 2_220_000,
            total: 2_220_000,
            ...taxSnapshot,
            paymentTermType: "IMMEDIATE",
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 2,
                baseUnitPrice: 1_110_000,
                finalUnitPrice: 1_110_000,
                subtotal: 2_220_000
              }
            }
          }
        });
        const shortOrder = await tx.salesOrder.create({
          data: {
            orderNumber: `SO-B9-AVG-${marker}`,
            customerId: shortCustomer.id,
            orderDate,
            status: "Confirmed",
            subtotal: 3_900_000,
            total: 3_900_000,
            ...buildOrderTaxSnapshot({
              totalAmount: 3_900_000,
              customerNpwp: shortCustomer.npwp
            }),
            paymentTermType: "CREDIT",
            creditTermMonths: 1,
            items: {
              create: {
                productId: product.id,
                itemName: product.productName,
                quantity: 3,
                baseUnitPrice: 1_300_000,
                finalUnitPrice: 1_300_000,
                subtotal: 3_900_000
              }
            }
          }
        });

        const behaviourOrders = [
          ...buildBehaviourOrders({
            marker,
            prefix: "IMMEDIATE",
            customerId: immediateCustomer.id,
            customerNpwp: immediateCustomer.npwp,
            orderDate,
            terms: ["IMMEDIATE", "IMMEDIATE"]
          }),
          ...buildBehaviourOrders({
            marker,
            prefix: "SHORT",
            customerId: shortCustomer.id,
            customerNpwp: shortCustomer.npwp,
            orderDate,
            terms: ["CREDIT_1", "CREDIT_1"]
          }),
          ...buildBehaviourOrders({
            marker,
            prefix: "LONG",
            customerId: requireMapValue(customers, "long").id,
            customerNpwp: requireMapValue(customers, "long").npwp,
            orderDate,
            terms: ["CREDIT_3", "CREDIT_3", "CREDIT_3"]
          }),
          ...buildBehaviourOrders({
            marker,
            prefix: "MIXED",
            customerId: requireMapValue(customers, "mixed").id,
            customerNpwp: requireMapValue(customers, "mixed").npwp,
            orderDate,
            terms: ["IMMEDIATE", "CREDIT_1", "CREDIT_3"]
          })
        ];
        await tx.salesOrder.createMany({ data: behaviourOrders });

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: `INV-B9-${marker}`,
            salesOrderId: taxedOrder.id,
            customerId: immediateCustomer.id,
            issueDate: orderDate,
            dueDate: orderDate,
            totalAmount: taxedOrder.total,
            paidAmount: 0,
            remainingAmount: taxedOrder.total,
            customerNpwpSnapshot: taxedOrder.customerNpwpSnapshot,
            ppnApplied: taxedOrder.ppnApplied,
            ppnRateBasisPoints: taxedOrder.ppnRateBasisPoints,
            ppnAmount: taxedOrder.ppnAmount,
            netSalesAmount: taxedOrder.netSalesAmount,
            paymentTermType: "IMMEDIATE"
          }
        });
        const assignment = validateDeliveryAssignment({
          driverName: "Budi Santoso",
          vehiclePlateNumber: "B 1234 TJK"
        });
        expect(assignment.valid).toBe(true);
        if (!assignment.valid) {
          throw new Error("Expected the Batch 9 delivery assignment to be valid");
        }
        const deliveryNote = await tx.deliveryNote.create({
          data: {
            deliveryNoteNumber: `SJ-B9-${marker}`,
            invoiceId: invoice.id,
            salesOrderId: taxedOrder.id,
            customerId: immediateCustomer.id,
            recipientName: immediateCustomer.name,
            recipientPhone: immediateCustomer.phone,
            recipientAddress: immediateCustomer.address,
            deliveryDate: orderDate,
            status: "Issued",
            ...assignment.value
          }
        });

        const customerRows = await tx.customer.findMany({
          where: { id: { in: [...customers.values()].map((customer) => customer.id) } },
          select: {
            companyName: true,
            salesOrders: {
              select: {
                orderDate: true,
                status: true,
                paymentTermType: true,
                creditTermMonths: true
              }
            }
          }
        });
        const behaviours = new Set(
          customerRows.map(
            (customer) => getCustomerPaymentBehaviour(customer).behaviour
          )
        );
        expect(behaviours).toEqual(
          new Set([
            "Immediate Payment",
            "Short-Term Credit",
            "Long-Term Credit",
            "Mixed",
            "No Payment History"
          ])
        );

        const productItems = await tx.salesOrderItem.findMany({
          where: { productId: product.id },
          select: {
            productId: true,
            quantity: true,
            subtotal: true,
            salesOrder: { select: { orderDate: true, status: true } }
          }
        });
        expect(
          getCurrentMonthAverageSoldPrice(product.id, productItems)
        ).toMatchObject({
          averageSoldPrice: 1_224_000,
          eligibleQuantity: 5,
          eligibleSalesValue: 6_120_000
        });
        expect(taxedOrder).toMatchObject({
          customerNpwpSnapshot: npwp,
          ppnApplied: true
        });
        expect(taxedOrder.netSalesAmount + taxedOrder.ppnAmount).toBe(
          taxedOrder.total
        );
        expect(shortOrder).toMatchObject({
          customerNpwpSnapshot: null,
          ppnApplied: false,
          ppnAmount: 0,
          netSalesAmount: shortOrder.total
        });
        expect(invoice).toMatchObject({
          customerNpwpSnapshot: taxedOrder.customerNpwpSnapshot,
          ppnApplied: taxedOrder.ppnApplied,
          ppnRateBasisPoints: taxedOrder.ppnRateBasisPoints,
          ppnAmount: taxedOrder.ppnAmount,
          netSalesAmount: taxedOrder.netSalesAmount
        });
        expect(deliveryNote).toMatchObject(assignment.value);

        throw new Error(ROLLBACK_MARKER);
      }, { timeout: 20_000 })
    ).rejects.toThrow(ROLLBACK_MARKER);
  }, 30_000);
});

type BehaviourTerm = "IMMEDIATE" | "CREDIT_1" | "CREDIT_3";

function buildBehaviourOrders({
  marker,
  prefix,
  customerId,
  customerNpwp,
  orderDate,
  terms
}: {
  marker: string;
  prefix: string;
  customerId: string;
  customerNpwp: string | null;
  orderDate: Date;
  terms: BehaviourTerm[];
}) {
  return terms.map((term, index) => ({
    orderNumber: `SO-B9-${prefix}-${index}-${marker}`,
    customerId,
    orderDate,
    status: "Confirmed" as const,
    subtotal: 1_000,
    total: 1_000,
    ...buildOrderTaxSnapshot({ totalAmount: 1_000, customerNpwp }),
    paymentTermType: term === "IMMEDIATE" ? ("IMMEDIATE" as const) : ("CREDIT" as const),
    creditTermMonths: term === "IMMEDIATE" ? null : term === "CREDIT_1" ? 1 : 3
  }));
}

function requireMapValue<T>(values: Map<string, T>, key: string) {
  const value = values.get(key);
  if (!value) {
    throw new Error(`Missing Batch 9 fixture: ${key}`);
  }
  return value;
}
