import type { Prisma } from "@prisma/client";

type InquiryClient = Pick<Prisma.TransactionClient, "customerInquiry">;

export async function completeCustomerInquiriesForDeliveredOrders(
  db: InquiryClient,
  salesOrderIds: string[]
) {
  const uniqueOrderIds = [...new Set(salesOrderIds.filter(Boolean))];
  if (!uniqueOrderIds.length) return [];

  const inquiries = await db.customerInquiry.findMany({
    where: {
      salesOrderId: { in: uniqueOrderIds },
      status: { in: ["ConvertedToCustomerPO", "ConvertedToSO"] }
    },
    select: {
      id: true,
      inquiryNumber: true,
      salesOrderId: true
    }
  });

  if (!inquiries.length) return [];

  const result = await db.customerInquiry.updateMany({
    where: {
      id: { in: inquiries.map(inquiry => inquiry.id) },
      status: { in: ["ConvertedToCustomerPO", "ConvertedToSO"] }
    },
    data: {
      status: "Done",
      statusNote: "Linked order delivery completed"
    }
  });

  if (result.count !== inquiries.length) {
    throw new Error("CUSTOMER_INQUIRY_CONFLICT");
  }

  return inquiries.map(inquiry => ({
    ...inquiry,
    status: "Done" as const,
    statusNote: "Linked order delivery completed"
  }));
}

export async function completeCustomerInquiryForDeliveredOrder(
  db: InquiryClient,
  salesOrderId: string
) {
  return (await completeCustomerInquiriesForDeliveredOrders(db, [salesOrderId]))[0] ?? null;
}
