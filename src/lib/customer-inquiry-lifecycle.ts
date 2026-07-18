import type { Prisma } from "@prisma/client";

type InquiryClient = Pick<Prisma.TransactionClient, "customerInquiry">;

export async function completeCustomerInquiryForDeliveredOrder(
  db: InquiryClient,
  salesOrderId: string
) {
  const inquiry = await db.customerInquiry.findFirst({
    where: {
      salesOrderId,
      status: { in: ["ConvertedToPO", "ConvertedToSO"] }
    }
  });

  if (!inquiry) return null;

  return db.customerInquiry.update({
    where: { id: inquiry.id },
    data: {
      status: "Done",
      statusNote: "Linked order delivery completed"
    }
  });
}
