import { describe, expect, it } from "vitest";
import {
  canGenerateInvoiceForApproval,
  getApprovalReasonLabel,
  requiresApprovalDecisionNote,
  requiresManagerApproval
} from "../../src/lib/sales-order-approval";

describe("sales order manager approval", () => {
  it("requires approval only when Sales selects a customer with outstanding payments", () => {
    expect(requiresManagerApproval("SALES", "Outstanding Payment")).toBe(true);
    expect(requiresManagerApproval("SALES", "Clean")).toBe(false);
    expect(requiresManagerApproval("MANAGER", "Outstanding Payment")).toBe(false);
    expect(requiresManagerApproval("ADMIN", "Outstanding Payment")).toBe(false);
  });

  it("does not present an old approval snapshot as current customer payment status", () => {
    expect(getApprovalReasonLabel("Outstanding Payment")).toBe("Outstanding Payment");
    expect(getApprovalReasonLabel("Historically Late")).toBe("Manager review required");
    expect(getApprovalReasonLabel(null)).toBe("Manager review required");
  });

  it("blocks invoice generation until approval is complete", () => {
    expect(canGenerateInvoiceForApproval("Pending")).toBe(false);
    expect(canGenerateInvoiceForApproval("Rejected")).toBe(false);
    expect(canGenerateInvoiceForApproval("Approved")).toBe(true);
    expect(canGenerateInvoiceForApproval("NotRequired")).toBe(true);
  });

  it("requires an accountable reason only when an order is rejected", () => {
    expect(requiresApprovalDecisionNote("Rejected")).toBe(true);
    expect(requiresApprovalDecisionNote("Approved")).toBe(false);
  });
});
