import { describe, expect, it } from "vitest";
import { canRole } from "../../src/lib/role-access";

describe("role capability limitations", () => {
  it.each([
    ["MANAGER", true], ["SALES", true], ["ADMIN", false],
    [undefined, false], [null, false], ["UNKNOWN", false]
  ])("sets Inquiry mutation access for %s to %s", (role, allowed) => {
    expect(canRole(role as string | null | undefined, "MANAGE_CUSTOMER_INQUIRY")).toBe(allowed);
  });

  it("allows Manager to perform every managed capability", () => {
    expect(canRole("MANAGER", "CREATE_SALES_ORDER")).toBe(true);
    expect(canRole("MANAGER", "DELETE_SALES_ORDER")).toBe(true);
    expect(canRole("MANAGER", "CREATE_INVOICE")).toBe(true);
    expect(canRole("MANAGER", "RECORD_PAYMENT")).toBe(true);
    expect(canRole("MANAGER", "CREATE_SURAT_JALAN")).toBe(true);
    expect(canRole("MANAGER", "CREATE_ACCOUNT")).toBe(false);
  });

  it("limits Sales financial and administration creation actions", () => {
    expect(canRole("SALES", "CREATE_SALES_ORDER")).toBe(true);
    expect(canRole("SALES", "DELETE_SALES_ORDER")).toBe(false);
    expect(canRole("SALES", "CREATE_INVOICE")).toBe(false);
    expect(canRole("SALES", "RECORD_PAYMENT")).toBe(false);
    expect(canRole("SALES", "CREATE_SURAT_JALAN")).toBe(false);
    expect(canRole("SALES", "CREATE_ACCOUNT")).toBe(false);
  });

  it("limits Admin from Sales Order and manual Audit Trail creation", () => {
    expect(canRole("ADMIN", "CREATE_SALES_ORDER")).toBe(false);
    expect(canRole("ADMIN", "DELETE_SALES_ORDER")).toBe(true);
    expect(canRole("ADMIN", "CREATE_AUDIT_TRAIL")).toBe(false);
    expect(canRole("ADMIN", "CREATE_INVOICE")).toBe(true);
    expect(canRole("ADMIN", "RECORD_PAYMENT")).toBe(true);
    expect(canRole("ADMIN", "CREATE_SURAT_JALAN")).toBe(true);
    expect(canRole("ADMIN", "CREATE_ACCOUNT")).toBe(true);
  });
});
