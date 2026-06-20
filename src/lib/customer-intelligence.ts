export type CustomerCategory = "New" | "Loyal" | "Normal" | "Occasional";
export type CustomerPaymentRisk = "Late Payment" | "Historically Late" | "Clean";

export type CustomerInsightRow = {
  id: string;
  companyName: string;
  contactName: string;
  customerType: string;
  category: CustomerCategory;
  markup: string;
  monthlyOrderRate: number;
  transactionCount: number;
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
    transactionCount: recentOrderCount
  };
}

export function buildCustomerInsights(
  customers: Array<{
    id: string;
    companyName: string;
    name: string;
    customerType: string;
    createdAt: Date;
    salesOrders: Array<{ orderDate: Date }>;
  }>,
  now = new Date()
): CustomerInsightRow[] {
  return customers.map((customer) => ({
    id: customer.id,
    companyName: customer.companyName,
    contactName: customer.name,
    customerType: customer.customerType,
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

export function getCategoryMarkup(category: CustomerCategory) {
  return {
    New: "0%",
    Loyal: "0%",
    Normal: "5%",
    Occasional: "10–15%"
  }[category];
}
