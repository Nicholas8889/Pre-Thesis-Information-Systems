import type { CustomerPaymentStatus } from "@/lib/customer-intelligence";

export type SalesOrderApprovalStatus =
  | "NotRequired"
  | "Pending"
  | "Approved"
  | "Rejected";

export function requiresManagerApproval(
  role: string,
  paymentStatus: CustomerPaymentStatus
) {
  return role === "SALES" && paymentStatus === "Outstanding Payment";
}

export function getApprovalReasonLabel(reason: string | null) {
  // Existing approval snapshots remain unchanged; they are not current customer status.
  return reason === "Outstanding Payment" ? reason : "Manager review required";
}

export function canGenerateInvoiceForApproval(status: SalesOrderApprovalStatus) {
  return status === "NotRequired" || status === "Approved";
}

export function requiresApprovalDecisionNote(
  decision: Extract<SalesOrderApprovalStatus, "Approved" | "Rejected">
) {
  return decision === "Rejected";
}
