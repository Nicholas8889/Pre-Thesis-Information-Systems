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

  it("limits confirmation notes to 150 characters", () => {
    expect(normalizeActionNote("x".repeat(200))).toHaveLength(MAX_ACTION_NOTE_LENGTH);
  });
});
