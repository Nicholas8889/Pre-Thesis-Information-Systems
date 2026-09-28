export const MAX_ACTION_NOTE_LENGTH = 150;

export type ActionNotePolicy = "optional" | "required";

export class ActionNoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionNoteValidationError";
  }
}

export function normalizeActionNote(
  value: string,
  policy: ActionNotePolicy = "optional"
) {
  const note = value.trim();
  if (policy === "required" && !note) {
    throw new ActionNoteValidationError("A reason is required for this action");
  }
  if (note.length > MAX_ACTION_NOTE_LENGTH) {
    throw new ActionNoteValidationError(
      `Action notes must be ${MAX_ACTION_NOTE_LENGTH} characters or fewer`
    );
  }
  return note;
}

export function mergeActionNotes(existing: string | null | undefined, actionNote: string) {
  const current = existing?.trim() ?? "";
  const confirmation = normalizeActionNote(actionNote);
  if (!confirmation) return current || null;
  return current ? `${current}\nConfirmation note: ${confirmation}` : confirmation;
}
