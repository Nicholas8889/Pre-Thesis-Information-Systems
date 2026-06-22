import { describe, expect, it } from "vitest";
import { getActionConfirmationRules } from "../../src/lib/action-confirmation";

describe("action confirmation rules", () => {
  it("keeps notes optional for creation and payment actions", () => {
    expect(getActionConfirmationRules({ label: "Create Sales Order" }).requiresNote).toBe(false);
    expect(getActionConfirmationRules({ label: "Record Payment" }).requiresNote).toBe(false);
  });

  it("requires notes for deletion actions", () => {
    expect(getActionConfirmationRules({ label: "Delete Sales Order" }).requiresNote).toBe(true);
    expect(
      getActionConfirmationRules({ label: "Submit", forceRequiredNote: true }).requiresNote
    ).toBe(true);
  });
});
