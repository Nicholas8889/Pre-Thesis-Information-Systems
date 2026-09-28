import { describe, expect, it } from "vitest";
import {
  MAX_ACTION_NOTE_LENGTH,
  mergeActionNotes,
  normalizeActionNote
} from "../../src/lib/action-notes";

describe("action confirmation notes", () => {
  it("uses an optional confirmation note when no record note exists", () => {
    expect(mergeActionNotes(null, "Approved for processing")).toBe(
      "Approved for processing"
    );
  });

  it("appends a confirmation note without replacing existing record notes", () => {
    expect(mergeActionNotes("Customer requested delivery", "Checked by Admin")).toBe(
      "Customer requested delivery\nConfirmation note: Checked by Admin"
    );
  });

  it("keeps existing notes when the optional confirmation note is empty", () => {
    expect(mergeActionNotes("Existing note", "  ")).toBe("Existing note");
  });

  it("accepts 150 characters without truncation", () => {
    expect(normalizeActionNote("x".repeat(MAX_ACTION_NOTE_LENGTH))).toHaveLength(
      MAX_ACTION_NOTE_LENGTH
    );
  });

  it("counts Unicode input by JavaScript characters without byte truncation", () => {
    const unicodeReason = "é".repeat(MAX_ACTION_NOTE_LENGTH);
    expect(normalizeActionNote(` ${unicodeReason} `, "required")).toBe(unicodeReason);
    expect(() => normalizeActionNote(`${unicodeReason}é`, "required")).toThrow(
      "150 characters or fewer"
    );
  });

  it("accepts the one-character lower boundary", () => {
    expect(normalizeActionNote("x", "required")).toBe("x");
  });

  it("rejects 151 characters instead of truncating", () => {
    expect(() => normalizeActionNote("x".repeat(MAX_ACTION_NOTE_LENGTH + 1))).toThrow(
      "150 characters or fewer"
    );
  });

  it("requires a non-whitespace note for sensitive actions", () => {
    expect(() => normalizeActionNote("   ", "required")).toThrow(
      "A reason is required"
    );
    expect(normalizeActionNote(" approved ", "required")).toBe("approved");
  });
});
