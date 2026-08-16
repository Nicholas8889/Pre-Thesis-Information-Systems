export type CustomerCategory = "New" | "Loyal" | "Normal" | "Occasional";
export type CustomerPaymentRisk = "Late Payment" | "Historically Late" | "Clean";
export type CustomerPaymentBehaviour =
  | "Immediate Payment"
  | "Short-Term Credit"
  | "Long-Term Credit"
  | "Mixed"
  | "No Payment History";

export type CustomerPaymentBehaviourResult = {
  behaviour: CustomerPaymentBehaviour;
  counts: {
    immediatePayment: number;
    shortTermCredit: number;
    longTermCredit: number;
  };
  orderCount: number;
  limitedHistory: boolean;
  evidence: string;
  observationStart: Date;
  observationEnd: Date;
};

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const PAYMENT_BEHAVIOUR_ELIGIBLE_STATUSES = new Set([
  "Confirmed",
  "Invoiced",
  "Shipped"
]);

export type CustomerInsightRow = {
  id: string;
  companyName: string;
  contactName: string;
  customerSegment: string;
  category: CustomerCategory;
  markup: string;
  monthlyOrderRate: number;
  orderCount: number;
};

export function getCustomerCategory(customer: {
  createdAt: Date;
  salesOrders: Array<{ orderDate: Date }>;
}, now = new Date()) {
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recentOrderCount = customer.salesOrders.filter(
    (order) => order.orderDate >= threeMonthsAgo && order.orderDate <= now
  ).length;
  const monthlyOrderRate = recentOrderCount / 3;

  let category: CustomerCategory;
  if (customer.createdAt >= oneMonthAgo) category = "New";
  else if (monthlyOrderRate > 3) category = "Loyal";
  else if (monthlyOrderRate >= 1) category = "Normal";
  else category = "Occasional";

  return {
    category,
    markup: getCategoryMarkup(category),
    monthlyOrderRate,
    orderCount: recentOrderCount
  };
}

export function buildCustomerInsights(
  customers: Array<{
    id: string;
    companyName: string;
    name: string;
    customerSegment: string;
    createdAt: Date;
    salesOrders: Array<{ orderDate: Date }>;
  }>,
  now = new Date()
): CustomerInsightRow[] {
  return customers.map((customer) => ({
    id: customer.id,
    companyName: customer.companyName,
    contactName: customer.name,
    customerSegment: customer.customerSegment,
    ...getCustomerCategory(customer, now)
  }));
}

export function getCustomerPaymentRisk(
  customer: {
    invoices: Array<{
      dueDate: Date;
      remainingAmount: number;
      status: string;
      payments: Array<{ paymentDate: Date }>;
    }>;
  },
  now = new Date()
): CustomerPaymentRisk {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hasCurrentLatePayment = customer.invoices.some(
    (invoice) =>
      invoice.status !== "Cancelled" &&
      invoice.remainingAmount > 0 &&
      (invoice.status === "Overdue" || invoice.dueDate < today)
  );

  if (hasCurrentLatePayment) return "Late Payment";

  const hasHistoricalLatePayment = customer.invoices.some((invoice) =>
    invoice.payments.some((payment) => payment.paymentDate > invoice.dueDate)
  );

  return hasHistoricalLatePayment ? "Historically Late" : "Clean";
}

export function getCustomerPaymentBehaviour(
  customer: {
    salesOrders: Array<{
      orderDate: Date;
      status: string;
      paymentTermType: string;
      creditTermMonths: number | null;
    }>;
  },
  now = new Date()
): CustomerPaymentBehaviourResult {
  const { observationStart, observationEnd } = getJakartaTrailingTwelveMonthWindow(now);
  const counts = {
    immediatePayment: 0,
    shortTermCredit: 0,
    longTermCredit: 0
  };

  for (const order of customer.salesOrders) {
    if (
      !PAYMENT_BEHAVIOUR_ELIGIBLE_STATUSES.has(order.status) ||
      order.orderDate < observationStart ||
      order.orderDate > observationEnd
    ) {
      continue;
    }

    if (order.paymentTermType === "IMMEDIATE") {
      counts.immediatePayment += 1;
    } else if ((order.creditTermMonths ?? 1) <= 1) {
      counts.shortTermCredit += 1;
    } else {
      counts.longTermCredit += 1;
    }
  }

  const orderCount =
    counts.immediatePayment + counts.shortTermCredit + counts.longTermCredit;
  const limitedHistory = orderCount > 0 && orderCount <= 2;
  const observationLabel = formatObservationWindow(observationStart, observationEnd);

  if (orderCount === 0) {
    return {
      behaviour: "No Payment History",
      counts,
      orderCount,
      limitedHistory: false,
      evidence: `No eligible orders in the last 12 months (${observationLabel}).`,
      observationStart,
      observationEnd
    };
  }

  const buckets: Array<{
    behaviour: Exclude<CustomerPaymentBehaviour, "Mixed" | "No Payment History">;
    count: number;
    evidenceLabel: string;
  }> = [
    {
      behaviour: "Immediate Payment",
      count: counts.immediatePayment,
      evidenceLabel: "immediate payment"
    },
    {
      behaviour: "Short-Term Credit",
      count: counts.shortTermCredit,
      evidenceLabel: "1-month-or-shorter credit"
    },
    {
      behaviour: "Long-Term Credit",
      count: counts.longTermCredit,
      evidenceLabel: "longer-than-1-month credit"
    }
  ];
  const dominantBucket = buckets.find(
    (bucket) => bucket.count * 100 >= orderCount * 60
  );
  const limitedHistorySuffix = limitedHistory ? " Limited history." : "";

  if (dominantBucket) {
    return {
      behaviour: dominantBucket.behaviour,
      counts,
      orderCount,
      limitedHistory,
      evidence: `${dominantBucket.count} of ${orderCount} eligible orders used ${dominantBucket.evidenceLabel} in the last 12 months (${observationLabel}).${limitedHistorySuffix}`,
      observationStart,
      observationEnd
    };
  }

  return {
    behaviour: "Mixed",
    counts,
    orderCount,
    limitedHistory,
    evidence: `Payment terms were mixed across ${orderCount} eligible orders in the last 12 months (${observationLabel}): ${counts.immediatePayment} immediate payment, ${counts.shortTermCredit} short-term credit, and ${counts.longTermCredit} long-term credit.${limitedHistorySuffix}`,
    observationStart,
    observationEnd
  };
}

export function getJakartaTrailingTwelveMonthWindow(now = new Date()) {
  const jakartaNow = new Date(now.getTime() + JAKARTA_UTC_OFFSET_MS);
  const startYear = jakartaNow.getUTCFullYear() - 1;
  const startMonth = jakartaNow.getUTCMonth();
  const startDay = Math.min(
    jakartaNow.getUTCDate(),
    new Date(Date.UTC(startYear, startMonth + 1, 0)).getUTCDate()
  );
  const observationStart = new Date(
    Date.UTC(
      startYear,
      startMonth,
      startDay,
      jakartaNow.getUTCHours(),
      jakartaNow.getUTCMinutes(),
      jakartaNow.getUTCSeconds(),
      jakartaNow.getUTCMilliseconds()
    ) - JAKARTA_UTC_OFFSET_MS
  );

  return {
    observationStart,
    observationEnd: new Date(now)
  };
}

function formatObservationWindow(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

export function getCategoryMarkup(category: CustomerCategory) {
  return {
    New: "0%",
    Loyal: "0%",
    Normal: "5%",
    Occasional: "10–15%"
  }[category];
}
