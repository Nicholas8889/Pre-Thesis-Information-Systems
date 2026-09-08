export type DashboardRelationshipCustomer = {
  outreachActivities: Array<{ id: string }>;
  inquiries: Array<{ status: string }>;
  salesOrders: Array<{ status: string }>;
};

export type CustomerRelationshipSummary = {
  totalOutreach: number;
  outreachConverted: number;
  totalInquiries: number;
  openInquiries: number;
  closedInquiries: number;
};

export function buildCustomerRelationshipSummary(
  customers: DashboardRelationshipCustomer[]
): CustomerRelationshipSummary {
  return customers.reduce<CustomerRelationshipSummary>(
    (summary, customer) => {
      summary.totalOutreach += customer.outreachActivities.length;
      summary.totalInquiries += customer.inquiries.length;
      summary.openInquiries += customer.inquiries.filter(
        (inquiry) => inquiry.status === "Open"
      ).length;
      summary.closedInquiries += customer.inquiries.filter(
        (inquiry) => inquiry.status === "Closed" || inquiry.status === "Done"
      ).length;

      if (
        customer.outreachActivities.length > 0 &&
        customer.salesOrders.some((order) => order.status !== "Cancelled")
      ) {
        summary.outreachConverted += 1;
      }

      return summary;
    },
    {
      totalOutreach: 0,
      outreachConverted: 0,
      totalInquiries: 0,
      openInquiries: 0,
      closedInquiries: 0
    }
  );
}
