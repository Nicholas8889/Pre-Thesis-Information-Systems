import { describe, expect, it } from "vitest";
import { canCreateDeliveryFromSheet, getPickingDeliveryQuantity } from "../../src/lib/picking-list";
const sheet = {
  status: "Packed", usesChecklist: true, pickerName: "Dewi", packerName: null,
  items: [{ orderedQuantity: 10, availableQuantity: 0, packedQuantity: 0, availabilityStatus: "Unchecked", isChecked: true }],
};
describe("delivery from checklist sheets and historical lists", () => {
  it("uses checked order quantities with one PIC rather than legacy quantity inputs", () => {
    expect(canCreateDeliveryFromSheet(sheet)).toBe(true);
    expect(getPickingDeliveryQuantity(sheet, sheet.items[0])).toBe(10);
  });
  it.each(["unfinished", "unchecked", "blank-pic", "empty", "invalid-order"])("blocks %s", reason => {
    const list = { ...sheet, items: sheet.items.map(item => ({ ...item })) };
    if (reason === "unfinished") list.status = "InProgress";
    if (reason === "unchecked") list.items[0].isChecked = false;
    if (reason === "blank-pic") list.pickerName = " ";
    if (reason === "empty") list.items = [];
    if (reason === "invalid-order") list.items[0].orderedQuantity = 0;
    expect(canCreateDeliveryFromSheet(list)).toBe(false);
  });
  it("preserves historical shortages and their smaller ready quantities", () => {
    const legacy = { ...sheet, usesChecklist: false, packerName: "Raka", items: [
      { ...sheet.items[0], availableQuantity: 6, packedQuantity: 6, availabilityStatus: "Partial", notes: "4 unavailable" },
    ] };
    expect(canCreateDeliveryFromSheet(legacy)).toBe(true);
    expect(getPickingDeliveryQuantity(legacy, legacy.items[0])).toBe(6);
    expect(canCreateDeliveryFromSheet({ ...legacy, packerName: null })).toBe(false);
  });
});
