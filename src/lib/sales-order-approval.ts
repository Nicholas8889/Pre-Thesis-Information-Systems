import type { CustomerPaymentRisk } from "@/lib/customer-intelligence";

export type SalesOrderApprovalStatus =
  | "NotRequired"
  | "Pending"
  | "Approved"
  | "Rejected";

export function requiresManagerApproval(
  role: string,
  paymentRisk: CustomerPaymentRisk
) {
  return role === "SALES" && paymentRisk !== "Clean";
}

export function canGenerateInvoiceForApproval(status: SalesOrderApprovalStatus) {
  return status === "NotRequired" || status === "Approved";
}
