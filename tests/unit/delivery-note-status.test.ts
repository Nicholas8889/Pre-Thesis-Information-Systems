import { describe, expect, it } from "vitest";
import {
  getDeliveryNoteStatusLabel,
  parseJakartaDateTimeInput,
  toJakartaDateTimeInputValue
} from "../../src/lib/delivery-note-status";

describe("delivery note status presentation", () => {
  it("maps internal workflow values to user-facing Indonesian labels", () => {
    expect(getDeliveryNoteStatusLabel("Draft")).toBe("Draft");
    expect(getDeliveryNoteStatusLabel("Issued")).toBe("Dikirim");
    expect(getDeliveryNoteStatusLabel("Delivered")).toBe("Diterima");
    expect(getDeliveryNoteStatusLabel("Cancelled")).toBe("Dibatalkan");
  });

  it("round-trips datetime-local values in the Jakarta timezone", () => {
    const parsed = parseJakartaDateTimeInput("2026-09-21T14:30");
    expect(parsed?.toISOString()).toBe("2026-09-21T07:30:00.000Z");
    expect(toJakartaDateTimeInputValue(parsed!)).toBe("2026-09-21T14:30:00");
  });

  it("rejects impossible or malformed local date/time values", () => {
    expect(parseJakartaDateTimeInput("2026-02-30T10:00")).toBeNull();
    expect(parseJakartaDateTimeInput("21/09/2026 10:00")).toBeNull();
  });
});
