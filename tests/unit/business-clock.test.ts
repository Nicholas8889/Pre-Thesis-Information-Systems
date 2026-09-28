import { describe, expect, it } from "vitest";
import {
  getBusinessDateKeyWib,
  getBusinessDateWib,
  isBusinessDateAfterWib,
  isBusinessDateOnOrBeforeWib
} from "../../src/lib/business-clock";

describe("WIB business clock", () => {
  it("changes business date exactly at midnight Asia/Jakarta", () => {
    expect(getBusinessDateWib(new Date("2026-09-20T16:59:59.999Z")).toISOString())
      .toBe("2026-09-19T17:00:00.000Z");
    expect(getBusinessDateWib(new Date("2026-09-20T17:00:00.000Z")).toISOString())
      .toBe("2026-09-20T17:00:00.000Z");
  });

  it("compares calendar dates in WIB instead of host-local time", () => {
    const dueDate = new Date("2026-09-20T00:00:00.000Z");
    const sameBusinessDate = new Date("2026-09-20T16:59:59.999Z");
    const nextBusinessDate = new Date("2026-09-20T17:00:00.000Z");

    expect(getBusinessDateKeyWib(sameBusinessDate)).toBe(getBusinessDateKeyWib(dueDate));
    expect(isBusinessDateOnOrBeforeWib(sameBusinessDate, dueDate)).toBe(true);
    expect(isBusinessDateAfterWib(nextBusinessDate, dueDate)).toBe(true);
  });
});
