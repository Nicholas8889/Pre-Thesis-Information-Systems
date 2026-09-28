import type { SalesOrderApprovalStatus, SalesOrderStatus } from "@prisma/client";

export function canGenerateInvoiceForOrder(input: {
  status: SalesOrderStatus | string;
  approvalStatus: SalesOrderApprovalStatus | string;
  hasInvoice: boolean;
}) {
  return (
    !input.hasInvoice &&
    input.status === "Confirmed" &&
    (input.approvalStatus === "NotRequired" || input.approvalStatus === "Approved")
  );
}

export function canCancelInvoice(input: {
  status: string;
  paidAmount: number;
  paymentCount: number;
}) {
  return (
    input.status === "Unpaid" &&
    input.paidAmount === 0 &&
    input.paymentCount === 0
  );
}
