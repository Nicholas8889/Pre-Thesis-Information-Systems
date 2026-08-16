import { describe, expect, it } from "vitest";
import { formatNpwp, parseOptionalNpwp } from "../../src/lib/npwp";

describe("customer NPWP", () => {
  it("normalizes supported display separators and keeps the field optional", () => {
    expect(parseOptionalNpwp(" 01.234.567.8-901.234 ")).toEqual({
      valid: true,
      value: "012345678901234"
    });
    expect(parseOptionalNpwp("0123 4567 8901 2345")).toEqual({
      valid: true,
      value: "0123456789012345"
    });
    expect(parseOptionalNpwp("   ")).toEqual({ valid: true, value: null });
  });

  it("rejects invalid values with a concise validation message", () => {
    expect(parseOptionalNpwp("01A2345678901234")).toEqual({
      valid: false,
      value: null,
      error: "NPWP must contain 15 or 16 digits"
    });
    expect(parseOptionalNpwp("12345678901234")).toMatchObject({ valid: false });
  });

  it("formats normalized 15 and 16 digit values for customer detail", () => {
    expect(formatNpwp("012345678901234")).toBe("01.234.567.8-901.234");
    expect(formatNpwp("0123456789012345")).toBe("0123 4567 8901 2345");
    expect(formatNpwp(null)).toBeNull();
  });
});
