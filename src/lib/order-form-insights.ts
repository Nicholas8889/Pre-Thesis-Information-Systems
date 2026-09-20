import type { PrismaClient } from "@prisma/client";
import {
  getCustomerPaymentBehaviourFromCounts,
  getCustomerPaymentSummaryFromAggregate,
  getJakartaTrailingTwelveMonthWindow,
  type CustomerPaymentBehaviourCounts
} from "@/lib/customer-intelligence";
import { formatNpwp } from "@/lib/npwp";
import {
  getCurrentMonthAverageSoldPriceFromAggregate,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "@/lib/product-insights";

type OrderFormInsightsClient = Pick<
  PrismaClient,
  "customer" | "invoice" | "product" | "salesOrder" | "salesOrderItem"
>;

const PAYMENT_BEHAVIOUR_ELIGIBLE_STATUSES = [
  "Confirmed",
  "Invoiced",
  "Shipped"
] as const;

const EMPTY_PAYMENT_BEHAVIOUR_COUNTS: CustomerPaymentBehaviourCounts = {
  immediatePayment: 0,
  shortTermCredit: 0,
  longTermCredit: 0
};

export async function loadOrderFormInsights(
  db: OrderFormInsightsClient,
  now = new Date()
) {
  const customerHistoryWindow = getJakartaTrailingTwelveMonthWindow(now);
  const currentMonth = getJakartaCurrentMonthWindow(now);

  const [
    customerRecords,
    customerBalanceAggregates,
    customerBehaviourAggregates,
    productRecords,
    productPriceAggregates
  ] = await Promise.all([
    db.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        name: true,
        npwp: true
      }
    }),
    db.invoice.groupBy({
      by: ["customerId"],
      where: {
        customer: { status: "Active" },
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
    db.salesOrder.groupBy({
      by: ["customerId", "paymentTermType", "creditTermMonths"],
      where: {
        customer: { status: "Active" },
        orderDate: {
          gte: customerHistoryWindow.observationStart,
          lte: customerHistoryWindow.observationEnd
        },
        status: { in: [...PAYMENT_BEHAVIOUR_ELIGIBLE_STATUSES] }
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
  const behaviourCountsByCustomer = new Map<
    string,
    CustomerPaymentBehaviourCounts
  >();

  for (const aggregate of customerBehaviourAggregates) {
    const counts = behaviourCountsByCustomer.get(aggregate.customerId) ?? {
      ...EMPTY_PAYMENT_BEHAVIOUR_COUNTS
    };
    const count = aggregate._count._all;

    if (aggregate.paymentTermType === "IMMEDIATE") {
      counts.immediatePayment += count;
    } else if ((aggregate.creditTermMonths ?? 1) <= 1) {
      counts.shortTermCredit += count;
    } else {
      counts.longTermCredit += count;
    }

    behaviourCountsByCustomer.set(aggregate.customerId, counts);
  }

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
      const paymentBehaviour = getCustomerPaymentBehaviourFromCounts(
        behaviourCountsByCustomer.get(customer.id) ?? EMPTY_PAYMENT_BEHAVIOUR_COUNTS,
        now
      );

      return {
        id: customer.id,
        companyName: customer.companyName,
        name: customer.name,
        ...(balancesByCustomer.get(customer.id) ??
          getCustomerPaymentSummaryFromAggregate({
            outstandingAmount: 0,
            openInvoiceCount: 0
          })),
        paymentBehaviour: paymentBehaviour.behaviour,
        paymentBehaviourEvidence: paymentBehaviour.evidence,
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
