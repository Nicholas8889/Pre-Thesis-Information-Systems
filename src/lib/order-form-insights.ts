import type { Prisma, PrismaClient } from "@prisma/client";
import {
  getCustomerPaymentSummaryFromAggregate
} from "@/lib/customer-intelligence";
import { getEffectiveInvoiceStatusWhere } from "@/lib/invoice-status";
import { formatNpwp } from "@/lib/npwp";
import { customerInvoiceBalanceSelect } from "@/lib/customer-payment-query";
import { getCustomerPaymentReliability } from "@/lib/customer-payment-reliability";
import {
  getCurrentMonthAverageSoldPriceFromAggregate,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "@/lib/product-insights";

type OrderFormInsightsClient = Pick<
  PrismaClient,
  "customer" | "invoice" | "product" | "salesOrderItem"
>;

export async function loadOrderFormInsights(
  db: OrderFormInsightsClient,
  now = new Date(),
  customerWhere: Prisma.CustomerWhereInput = {}
) {
  const currentMonth = getJakartaCurrentMonthWindow(now);

  const [
    customerRecords,
    customerBalanceAggregates,
    overdueInvoiceAggregates,
    productRecords,
    productPriceAggregates
  ] = await Promise.all([
    db.customer.findMany({
      where: { status: "Active", ...customerWhere },
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        name: true,
        npwp: true,
        invoices: { select: customerInvoiceBalanceSelect }
      }
    }),
    db.invoice.groupBy({
      by: ["customerId"],
      where: {
        customer: { status: "Active", ...customerWhere },
        status: { not: "Cancelled" },
        remainingAmount: { gt: 0 },
        OR: [
          {
            deliverySources: {
              some: { deliveryNote: { status: "Delivered" } }
            }
          },
          { deliveryNotes: { some: { status: "Delivered" } } },
          {
            salesOrder: {
              deliveryNotes: {
                some: { invoiceId: null, status: "Delivered" }
              }
            }
          }
        ]
      },
      _sum: { remainingAmount: true },
      _count: { _all: true }
    }),
    db.invoice.groupBy({
      by: ["customerId"],
      where: {
        customer: { status: "Active", ...customerWhere },
        ...getEffectiveInvoiceStatusWhere("Overdue", now)
      },
      _count: { _all: true }
    }),
    db.product.findMany({
      where: { status: "Active" },
      orderBy: { productName: "asc" },
      select: {
        id: true,
        productName: true,
        listPrice: true
      }
    }),
    db.salesOrderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        product: { status: "Active" },
        quantity: { gt: 0 },
        subtotal: { gte: 0 },
        salesOrder: {
          orderDate: {
            gte: currentMonth.monthStart,
            lte: now,
            lt: currentMonth.nextMonthStart
          },
          status: { in: [...PRODUCT_AVERAGE_ELIGIBLE_STATUSES] }
        }
      },
      _sum: { quantity: true, subtotal: true }
    })
  ]);

  const balancesByCustomer = new Map(
    customerBalanceAggregates.map((aggregate) => [
      aggregate.customerId,
      getCustomerPaymentSummaryFromAggregate({
        outstandingAmount: aggregate._sum.remainingAmount ?? 0,
        openInvoiceCount: aggregate._count._all
      })
    ])
  );
  const overdueInvoiceCountsByCustomer = new Map(
    overdueInvoiceAggregates.map((aggregate) => [
      aggregate.customerId,
      aggregate._count._all
    ])
  );

  const pricesByProduct = new Map(
    productPriceAggregates.flatMap((aggregate) =>
      aggregate.productId
        ? [
            [
              aggregate.productId,
              getCurrentMonthAverageSoldPriceFromAggregate(
                {
                  eligibleQuantity: aggregate._sum.quantity ?? 0,
                  eligibleSalesValue: aggregate._sum.subtotal ?? 0
                },
                now
              )
            ] as const
          ]
        : []
    )
  );

  return {
    customers: customerRecords.map((customer) => {
      const reliability = getCustomerPaymentReliability(customer, now);
      return {
        id: customer.id,
        companyName: customer.companyName,
        name: customer.name,
        ...(balancesByCustomer.get(customer.id) ??
          getCustomerPaymentSummaryFromAggregate({
            outstandingAmount: 0,
            openInvoiceCount: 0
          })),
        overdueInvoiceCount: overdueInvoiceCountsByCustomer.get(customer.id) ?? 0,
        paymentReliability: reliability.label,
        paymentReliabilityEvidence: reliability.evidence,
        npwp: formatNpwp(customer.npwp),
        ppnApplied: Boolean(customer.npwp)
      };
    }),
    products: productRecords.map((product) => {
      const average =
        pricesByProduct.get(product.id) ??
        getCurrentMonthAverageSoldPriceFromAggregate(
          { eligibleQuantity: 0, eligibleSalesValue: 0 },
          now
        );

      return {
        id: product.id,
        productName: product.productName,
        listPrice: product.listPrice,
        averageSoldPrice: average.averageSoldPrice,
        averageEligibleQuantity: average.eligibleQuantity,
        averageMonthLabel: average.monthLabel
      };
    })
  };
}
