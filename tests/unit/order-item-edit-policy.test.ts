import { describe, expect, it } from "vitest";
import { getOrderItemEditEligibility, type OrderItemEditState } from "../../src/lib/order-item-edit-policy";
import { canRole } from "../../src/lib/role-access";

const base: OrderItemEditState = {
  status: "Confirmed", approvalStatus: "NotRequired", createdByUserId: "sales-1", packStartedAt: null,
  customer: { status: "Active" }, invoice: null, pickingList: null,
  _count: { deliveryNotes: 0, deliverySources: 0 },
};
const invoice = { status: "Unpaid", paidAmount: 0, _count: { payments: 0, deliveryNotes: 0, deliverySources: 0 } };
const pick = { status: "Pending", packedAt: null, items: [{ isChecked: false }], deliveryNote: null, deliverySource: null };
const actor = { id: "manager", role: "MANAGER" };

describe("SO/PO item-edit foundation policy", () => {
  it.each(["ADMIN", "MANAGER", "SALES"])("has the contextual capability for %s", role => {
    expect(canRole(role, "EDIT_SALES_ORDER_ITEMS")).toBe(true);
  });
  it.each(["Draft", "Confirmed"])("allows Sales's own pre-invoice %s transaction", status => {
    expect(getOrderItemEditEligibility({ id: "sales-1", role: "SALES" }, { ...base, status }).allowed).toBe(true);
  });
  it("allows review of the latest Pending approval draft", () => {
    expect(getOrderItemEditEligibility({ id: "sales-1", role: "SALES" }, { ...base, status: "Draft", approvalStatus: "Pending" }).allowed).toBe(true);
  });
  it.each(["ADMIN", "MANAGER"])("allows %s to revise an unpaid/unshipped order in Pick", role => {
    expect(getOrderItemEditEligibility({ id: "staff", role }, { ...base, status: "Invoiced", invoice, pickingList: pick }).allowed).toBe(true);
  });
  it("permits unpaid Overdue invoices without changing due dates", () => {
    expect(getOrderItemEditEligibility(actor, { ...base, status: "Invoiced", invoice: { ...invoice, status: "Overdue" } }).allowed).toBe(true);
  });
  it("limits an approved invoiced revision to Manager", () => {
    const approved = { ...base, status: "Invoiced", approvalStatus: "Approved", invoice };
    expect(getOrderItemEditEligibility({ id: "admin", role: "ADMIN" }, approved).code).toBe("MANAGER_REQUIRED");
    expect(getOrderItemEditEligibility(actor, approved).allowed).toBe(true);
  });
  it.each([
    ["Cancelled", "TERMINAL"], ["Shipped", "TERMINAL"], ["unknown", "INVALID_STATE"],
  ])("rejects status %s", (status, reason) => {
    expect(getOrderItemEditEligibility(actor, { ...base, status }).code).toBe(reason);
  });
  it("rejects rejected orders and inactive customers", () => {
    expect(getOrderItemEditEligibility(actor, { ...base, approvalStatus: "Rejected" }).code).toBe("TERMINAL");
    expect(getOrderItemEditEligibility(actor, { ...base, customer: { status: "Inactive" } }).code).toBe("CUSTOMER_INACTIVE");
  });
  it("does not reveal orders outside Sales ownership or to unknown roles", () => {
    expect(getOrderItemEditEligibility({ id: "other", role: "SALES" }, base).code).toBe("NOT_FOUND");
    expect(getOrderItemEditEligibility({ id: "other", role: "UNKNOWN" }, base).code).toBe("ROLE_DENIED");
    expect(getOrderItemEditEligibility(actor, null).code).toBe("NOT_FOUND");
  });
  it("blocks Sales after invoicing and all cancelled invoices", () => {
    expect(getOrderItemEditEligibility({ id: "sales-1", role: "SALES" }, { ...base, invoice }).code).toBe("SALES_INVOICED");
    expect(getOrderItemEditEligibility(actor, { ...base, invoice: { ...invoice, status: "Cancelled" } }).code).toBe("INVOICE_CANCELLED");
  });
  it.each([
    { ...invoice, _count: { ...invoice._count, payments: 1 } },
    { ...invoice, paidAmount: 1 }, { ...invoice, status: "Partial" }, { ...invoice, status: "Paid" },
  ])("blocks payment history even when the amount is zero: %o", state => {
    expect(getOrderItemEditEligibility(actor, { ...base, invoice: state }).code).toBe("PAYMENT_RECORDED");
  });
  it.each([
    { ...base, _count: { deliveryNotes: 1, deliverySources: 0 } },
    { ...base, _count: { deliveryNotes: 0, deliverySources: 1 } },
    { ...base, invoice: { ...invoice, _count: { ...invoice._count, deliveryNotes: 1 } } },
    { ...base, invoice: { ...invoice, _count: { ...invoice._count, deliverySources: 1 } } },
    { ...base, pickingList: { ...pick, deliveryNote: { id: "draft" } } },
    { ...base, pickingList: { ...pick, deliverySource: { id: "cancelled" } } },
    { ...base, pickingList: { ...pick, items: [{ isChecked: false, deliveryNoteItem: { id: "legacy-delivery-item" } }] } },
  ])("blocks any delivery link including draft, combined and cancelled links", state => {
    expect(getOrderItemEditEligibility(actor, state).code).toBe("DELIVERY_EXISTS");
  });
  it.each([
    { ...base, packStartedAt: new Date(), pickingList: pick },
    { ...base, pickingList: { ...pick, status: "InProgress" } },
    { ...base, pickingList: { ...pick, status: "Packed" } },
    { ...base, pickingList: { ...pick, packedAt: new Date() } },
    { ...base, pickingList: { ...pick, items: [{ isChecked: true }] } },
  ])("keeps Pack/reopened sheets locked even with empty/reset checks", state => {
    expect(getOrderItemEditEligibility(actor, state).code).toBe("PACK_STARTED");
  });
  it("fails closed for invoiced-without-invoice and pending approval with an invoice", () => {
    expect(getOrderItemEditEligibility(actor, { ...base, status: "Invoiced" }).code).toBe("INVALID_STATE");
    expect(getOrderItemEditEligibility(actor, { ...base, approvalStatus: "Pending", invoice }).code).toBe("INVALID_STATE");
  });
});
