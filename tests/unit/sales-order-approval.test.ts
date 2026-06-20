import { describe, expect, it } from "vitest";
import {
  canGenerateInvoiceForApproval,
  requiresManagerApproval
} from "../../src/lib/sales-order-approval";

describe("sales order manager approval", () => {
  it("requires approval only for risky customers selected by Sales", () => {
    expect(requiresManagerApproval("SALES", "Late Payment")).toBe(true);
    expect(requiresManagerApproval("SALES", "Historically Late")).toBe(true);
    expect(requiresManagerApproval("SALES", "Clean")).toBe(false);
    expect(requiresManagerApproval("MANAGER", "Late Payment")).toBe(false);
    expect(requiresManagerApproval("ADMIN", "Historically Late")).toBe(false);
  });

  it("blocks invoice generation until approval is complete", () => {
    expect(canGenerateInvoiceForApproval("Pending")).toBe(false);
    expect(canGenerateInvoiceForApproval("Rejected")).toBe(false);
    expect(canGenerateInvoiceForApproval("Approved")).toBe(true);
    expect(canGenerateInvoiceForApproval("NotRequired")).toBe(true);
  });
});
