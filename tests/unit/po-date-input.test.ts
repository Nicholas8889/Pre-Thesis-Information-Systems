import { describe, expect, it } from "vitest";
import { toBusinessDateInputWib } from "../../src/lib/business-clock";

describe("Customer PO required-date edit in WIB", () => {
  it.each([
    ["2026-10-19T17:00:00.000Z", "2026-10-20"],
    ["2026-10-20T16:59:59.000Z", "2026-10-20"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01"],
    ["2024-02-28T17:00:00.000Z", "2024-02-29"],
  ])("reopens %s as business date %s", (instant, expected) => {
    expect(toBusinessDateInputWib(new Date(instant))).toBe(expected);
  });
});
