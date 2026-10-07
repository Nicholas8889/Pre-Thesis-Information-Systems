import { describe, expect, it } from "vitest";
import { isPackChecklistComplete, parsePackChecklist } from "../../src/lib/pack-checklist";

const items = [{ id: "a" }, { id: "b" }];
function form() {
  const data = new FormData();
  for (const item of items) data.append("itemId", item.id);
  data.append("checkedItemId", "a");
  return data;
}
describe("Pack checklist payload", () => {
  it("persists both checked and unchecked rows without quantity input", () => {
    expect(parsePackChecklist(form(), items)).toEqual([
      { id: "a", isChecked: true }, { id: "b", isChecked: false },
    ]);
    expect(isPackChecklistComplete(parsePackChecklist(form(), items)!)).toBe(false);
    const data = form();
    data.append("checkedItemId", "b");
    expect(isPackChecklistComplete(parsePackChecklist(data, items)!)).toBe(true);
    expect(isPackChecklistComplete([])).toBe(false);
  });
  it.each(["duplicate-row", "foreign-row", "missing-row", "duplicate-check", "foreign-check", "quantity", "second-pic"])("rejects %s", kind => {
    const data = form();
    if (kind === "duplicate-row") data.append("itemId", "a");
    if (kind === "foreign-row") { data.delete("itemId"); data.append("itemId", "a"); data.append("itemId", "foreign"); }
    if (kind === "missing-row") { data.delete("itemId"); data.append("itemId", "a"); }
    if (kind === "duplicate-check") data.append("checkedItemId", "a");
    if (kind === "foreign-check") data.append("checkedItemId", "foreign");
    if (kind === "quantity") data.set("packed_a", "1");
    if (kind === "second-pic") data.set("packerName", "Other person");
    expect(parsePackChecklist(data, items)).toBeNull();
  });
});
