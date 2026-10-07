import { describe, expect, it } from "vitest";
import { buildOrderItemEditPlan, resolveEditApprovalPlan, type EditApprovalPlan } from "../../src/lib/order-item-edit-plan";
import type { OrderItemEditRecord } from "../../src/lib/order-item-edit-context";

const approval: EditApprovalPlan = { status: "Confirmed", approvalStatus: "NotRequired", approvalRisk: null, clearDecision: false, reaffirmDecision: false };
const before = { id: "order", version: 4, revisionNumber: 1, pickingList: null, invoice: null, total: 222,
  ppnApplied: true, ppnRateBasisPoints: 1100, items: [{ id: "line", productId: "original", itemName: "Agreed product", productSkuSnapshot: "OLD", quantity: 2,
    baseUnitPrice: 100, markupPercent: 20, discountPercent: 9, finalUnitPrice: 111, subtotal: 222 }] } as unknown as OrderItemEditRecord;
const replacement = { id: "replacement", productName: "New product", sku: "NEW", listPrice: 200, status: "Active" as const };

describe("canonical order item revision planning", () => {
  it("preserves stored name/SKU/pricing when quantity changes, independent of today's catalog", () => {
    const plan = buildOrderItemEditPlan(before, [{ itemId: "line", productId: "original", quantity: 3 }], [], approval);
    expect(plan.items[0]).toMatchObject({ itemId: "line", itemName: "Agreed product", productSkuSnapshot: "OLD", baseUnitPrice: 100, finalUnitPrice: 111, subtotal: 333, priceSource: "stored" });
    expect(plan).toMatchObject({ total: 333, ppnAmount: 33, netSalesAmount: 300 });
  });
  it("replaces the product using its current default and carries the row's adjustments", () => {
    const plan = buildOrderItemEditPlan(before, [{ itemId: "line", productId: "replacement", quantity: 2 }], [replacement], approval);
    expect(plan.items[0]).toMatchObject({ itemId: "line", itemName: "New product", productSkuSnapshot: "NEW", baseUnitPrice: 200, markupPercent: 20, discountPercent: 9, finalUnitPrice: 222, subtotal: 444 });
  });
  it("new rows start with the form's default 0 markup and 0 discount", () => {
    const plan = buildOrderItemEditPlan(before, [{ itemId: null, productId: "replacement", quantity: 2 }], [replacement], approval);
    expect(plan.items[0]).toMatchObject({ itemId: null, baseUnitPrice: 200, markupPercent: 0, discountPercent: 0, finalUnitPrice: 200 });
    expect(plan.removedItemIds).toEqual(["line"]);
  });
  it("keeps legacy product-less existing rows editable without inventing a product", () => {
    const legacy = { ...before, items: before.items.map(item => ({ ...item, productId: null })) };
    expect(buildOrderItemEditPlan(legacy, [{ itemId: "line", productId: null, quantity: 3 }], [], approval).items[0].finalUnitPrice).toBe(111);
  });
  it("requires active products only for added/replacement rows", () => {
    expect(() => buildOrderItemEditPlan(before, [{ itemId: "line", productId: "replacement", quantity: 2 }], [{ ...replacement, status: "Inactive" }], approval)).toThrow("active Product");
    expect(() => buildOrderItemEditPlan(before, [{ itemId: "foreign", productId: "replacement", quantity: 2 }], [replacement], approval)).toThrow("does not belong");
  });
  it("rejects no-ops and database integer overflow before any write", () => {
    expect(() => buildOrderItemEditPlan(before, [{ itemId: "line", productId: "original", quantity: 2 }], [], approval)).toThrow("No transaction items changed");
    expect(() => buildOrderItemEditPlan(before, [{ itemId: null, productId: "replacement", quantity: 1_000_000 }], [{ ...replacement, listPrice: 1_000_000_000 }], approval)).toThrow("rupiah amount range");
  });
  it("quote hashes change with replacement prices, invoice version and approval changes", () => {
    const lines = [{ itemId: "line", productId: "replacement", quantity: 2 }];
    const initial = buildOrderItemEditPlan(before, lines, [replacement], approval).quoteHash;
    expect(buildOrderItemEditPlan(before, lines, [{ ...replacement, listPrice: 201 }], approval).quoteHash).not.toBe(initial);
    expect(buildOrderItemEditPlan(before, lines, [replacement], { ...approval, status: "Draft", approvalStatus: "Pending", clearDecision: true }).quoteHash).not.toBe(initial);
    expect(buildOrderItemEditPlan(before, lines, [replacement], approval).quoteHash).toBe(initial);
    const withInvoice = { ...before, invoice: { version: 1, ppnApplied: true, ppnRateBasisPoints: 1100 } as NonNullable<OrderItemEditRecord["invoice"]> };
    const invoiceHash = buildOrderItemEditPlan(withInvoice, lines, [replacement], approval).quoteHash;
    expect(buildOrderItemEditPlan({ ...withInvoice, invoice: { ...withInvoice.invoice!, version: 2 } }, lines, [replacement], approval).quoteHash).not.toBe(invoiceHash);
  });
  it("refreshes approval risk for Sales while preserving/re-requesting previous review", () => {
    const clean = { ...before, status: "Confirmed" as const, approvalStatus: "NotRequired" as const, approvalRisk: null };
    expect(resolveEditApprovalPlan(clean, "SALES", "Outstanding Payment")).toMatchObject({ status: "Draft", approvalStatus: "Pending", approvalRisk: "Outstanding Payment", clearDecision: true });
    expect(resolveEditApprovalPlan(clean, "SALES", "Clean")).toMatchObject({ status: "Confirmed", approvalStatus: "NotRequired" });
    expect(resolveEditApprovalPlan({ ...clean, status: "Draft", approvalStatus: "Pending" }, "MANAGER", "Clean")).toMatchObject({ approvalStatus: "Pending", clearDecision: true });
    expect(resolveEditApprovalPlan({ ...clean, approvalStatus: "Approved" }, "ADMIN", "Clean")).toMatchObject({ status: "Draft", approvalStatus: "Pending", clearDecision: true });
    expect(resolveEditApprovalPlan({ ...clean, status: "Invoiced", approvalStatus: "Approved", invoice: {} as NonNullable<OrderItemEditRecord["invoice"]> }, "MANAGER", "Clean")).toMatchObject({ approvalStatus: "Approved", reaffirmDecision: true });
  });
});
