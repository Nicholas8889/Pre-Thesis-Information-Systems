import { canRole } from "@/lib/role-access";

export type OrderItemEditActor = { id: string; role: string };
export type OrderItemEditState = {
  status: string;
  approvalStatus: string;
  createdByUserId: string | null;
  packStartedAt: Date | null;
  customer: { status: string };
  invoice: null | {
    status: string; paidAmount: number;
    _count: { payments: number; deliveryNotes: number; deliverySources: number };
  };
  pickingList: null | {
    status: string; packedAt: Date | null;
    deliveryNote: { id: string } | null;
    deliverySource: { id: string } | null;
    items: { isChecked: boolean; deliveryNoteItem?: { id: string } | null }[];
  };
  _count: { deliveryNotes: number; deliverySources: number };
};

export const ORDER_ITEM_EDIT_REASONS = {
  ROLE_DENIED: "Only Sales, Admin and Manager can edit transaction items.",
  NOT_FOUND: "Transaction was not found or is outside your portfolio.",
  TERMINAL: "Cancelled, rejected or shipped transactions cannot be edited.",
  CUSTOMER_INACTIVE: "The customer is inactive.",
  INVOICE_CANCELLED: "The invoice has been cancelled.",
  PAYMENT_RECORDED: "A payment has already been recorded or the invoice is already settled.",
  DELIVERY_EXISTS: "The transaction already belongs to a Surat Jalan.",
  PACK_STARTED: "Pick & Pack has already entered Pack. Reopen does not unlock item editing.",
  SALES_INVOICED: "After invoicing, item changes must be applied by Admin or Manager.",
  MANAGER_REQUIRED: "An invoiced transaction that required approval can only be revised by Manager.",
  INVALID_STATE: "The transaction state does not permit item editing.",
} as const;

type DeniedReason = keyof typeof ORDER_ITEM_EDIT_REASONS;
export type OrderItemEditEligibility =
  | { allowed: true; code: "EDITABLE"; message: string }
  | { allowed: false; code: DeniedReason; message: string };

export function getOrderItemEditEligibility(
  actor: OrderItemEditActor,
  order: OrderItemEditState | null,
): OrderItemEditEligibility {
  const deny = (code: DeniedReason): OrderItemEditEligibility => ({ allowed: false, code, message: ORDER_ITEM_EDIT_REASONS[code] });
  if (!canRole(actor.role, "EDIT_SALES_ORDER_ITEMS")) return deny("ROLE_DENIED");
  // Keep Sales ownership consistent with the existing SO/PO portfolio scope.
  if (!order || (actor.role === "SALES" && order.createdByUserId !== actor.id)) return deny("NOT_FOUND");
  if (["Cancelled", "Shipped"].includes(order.status) || order.approvalStatus === "Rejected") return deny("TERMINAL");
  if (order.customer.status !== "Active") return deny("CUSTOMER_INACTIVE");
  if (order.invoice?.status === "Cancelled") return deny("INVOICE_CANCELLED");
  if (order.invoice && (order.invoice._count.payments > 0 || order.invoice.paidAmount > 0 || ["Partial", "Paid"].includes(order.invoice.status))) return deny("PAYMENT_RECORDED");
  if (order._count.deliveryNotes > 0 || order._count.deliverySources > 0 ||
      (order.invoice && (order.invoice._count.deliveryNotes > 0 || order.invoice._count.deliverySources > 0)) ||
      order.pickingList?.deliveryNote || order.pickingList?.deliverySource ||
      order.pickingList?.items.some(item => item.deliveryNoteItem)) return deny("DELIVERY_EXISTS");
  if (order.packStartedAt || (order.pickingList && (
    order.pickingList.status !== "Pending" || order.pickingList.packedAt || order.pickingList.items.some(item => item.isChecked)
  ))) return deny("PACK_STARTED");
  if (!["Draft", "Confirmed", "Invoiced"].includes(order.status) ||
      !["NotRequired", "Pending", "Approved"].includes(order.approvalStatus) ||
      (order.status === "Invoiced" && !order.invoice) ||
      (order.invoice && order.approvalStatus === "Pending")) return deny("INVALID_STATE");
  if (actor.role === "SALES" && order.invoice) return deny("SALES_INVOICED");
  if (order.invoice && order.approvalStatus === "Approved" && actor.role !== "MANAGER") return deny("MANAGER_REQUIRED");
  return { allowed: true, code: "EDITABLE", message: "Transaction items can be revised before payment and Pack." };
}
