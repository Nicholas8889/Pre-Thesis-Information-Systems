import type { CustomerInquiryStatus, Prisma } from "@prisma/client";

type InquiryConversionClient = Pick<Prisma.TransactionClient, "customerInquiry">;

export class InquiryConversionConflictError extends Error {
  constructor() {
    super("Customer Inquiry was already converted or changed");
    this.name = "InquiryConversionConflictError";
  }
}

export async function claimCustomerInquiryConversion(
  db: InquiryConversionClient,
  input: {
    inquiryId: string;
    salesOrderId: string;
    expectedUpdatedAt: Date;
    targetStatus: Extract<CustomerInquiryStatus, "ConvertedToCustomerPO" | "ConvertedToSO">;
  }
) {
  const claimed = await db.customerInquiry.updateMany({
    where: {
      id: input.inquiryId,
      status: "Open",
      salesOrderId: null,
      updatedAt: input.expectedUpdatedAt
    },
    data: {
      salesOrderId: input.salesOrderId,
      status: input.targetStatus,
      statusNote: input.targetStatus === "ConvertedToCustomerPO"
        ? "Converted to Customer PO"
        : "Converted to Sales Order"
    }
  });
  if (claimed.count !== 1) throw new InquiryConversionConflictError();
}
