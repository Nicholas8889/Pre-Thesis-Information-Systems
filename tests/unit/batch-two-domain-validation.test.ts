import { describe, expect, it } from "vitest";
import { parseDateOnly, toDateOnlyValue } from "../../src/lib/date-only";
import { haveSameDeliveryDestination, normalizeDeliveryDestination } from "../../src/lib/delivery-destination";
import { parsePaymentMethod } from "../../src/lib/payment-method";
import { parseExactPickingItems } from "../../src/lib/picking-item-payload";

function validPickingForm() {
  const data = new FormData();
  for (const id of ["item-a", "item-b"]) {
    data.append("itemId", id);
    data.set(`availability_${id}`, "Available");
    data.set(`available_${id}`, "2");
    data.set(`packed_${id}`, "2");
    data.set(`notes_${id}`, "");
  }
  return data;
}

const canonicalItems = [
  { id: "item-a", orderedQuantity: 2 },
  { id: "item-b", orderedQuantity: 2 },
];

describe("Batch 2 domain validation", () => {
  it.each(["Cash", "BankTransfer", "Other"])("accepts canonical payment method %s", method => {
    expect(parsePaymentMethod(method)).toBe(method);
  });

  it.each([null, "", "WireTransfer", "banktransfer", " BankTransfer "])(
    "rejects non-canonical payment method %s",
    method => {
      expect(parsePaymentMethod(method)).toBeNull();
    },
  );

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-09-13T00:00:00Z", "2026-09-13+07:00", "13/09/2026"])(
    "rejects invalid date-only input %s",
    value => {
      expect(parseDateOnly(value)).toBeNull();
    },
  );

  it.each(["2024-02-29", "2026-09-13"])("round-trips date-only value %s", value => {
    expect(toDateOnlyValue(parseDateOnly(value)!)).toBe(value);
  });

  it("normalizes harmless destination whitespace but rejects different destinations", () => {
    expect(normalizeDeliveryDestination("  Jl. Merdeka\nNo. 1 ")).toBe("jl. merdeka no. 1");
    expect(haveSameDeliveryDestination(["Jl. Merdeka No. 1", " JL. MERDEKA   NO. 1 "])).toBe(true);
    expect(haveSameDeliveryDestination(["Jakarta", "Surabaya"])).toBe(false);
    expect(haveSameDeliveryDestination(["", " "])).toBe(false);
  });

  it("accepts the exact canonical picking item set", () => {
    expect(parseExactPickingItems(validPickingForm(), canonicalItems)).toHaveLength(2);
  });

  it.each([
    "foreign item ID",
    "duplicate item ID",
    "missing item ID",
    "duplicate editable field",
    "foreign editable field",
    "tampered ordered quantity",
  ])("rejects %s", scenario => {
    const data = validPickingForm();
    if (scenario === "foreign item ID") data.set("itemId", "item-foreign");
    if (scenario === "duplicate item ID") data.append("itemId", "item-a");
    if (scenario === "missing item ID") data.delete("itemId");
    if (scenario === "duplicate editable field") data.append("packed_item-a", "2");
    if (scenario === "foreign editable field") data.set("packed_item-foreign", "1");
    if (scenario === "tampered ordered quantity") data.set("ordered_item-a", "999");
    expect(parseExactPickingItems(data, canonicalItems)).toBeNull();
  });
});
