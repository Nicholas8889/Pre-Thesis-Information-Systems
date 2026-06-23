import { describe, expect, it } from "vitest";
import { nextNumberFromExisting } from "../../src/lib/document-numbering";

describe("document numbering", () => {
  it("uses the highest existing sequence instead of record count", () => {
    expect(
      nextNumberFromExisting({
        existingNumbers: [
          "SJ-2026-001",
          "SJ-2026-002",
          "SJ-2026-010",
          "SJ-2026-102"
        ],
        prefix: "SJ",
        year: 2026
      })
    ).toBe("SJ-2026-103");
  });

  it("ignores other prefixes, years, and malformed sequences", () => {
    expect(
      nextNumberFromExisting({
        existingNumbers: [
          "INV-2026-999",
          "SJ-2025-099",
          "SJ-2026-ABC",
          "SJ-2026-004"
        ],
        prefix: "SJ",
        year: 2026
      })
    ).toBe("SJ-2026-005");
  });
});
