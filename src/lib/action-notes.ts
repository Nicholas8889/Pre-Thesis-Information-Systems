export const MAX_ACTION_NOTE_LENGTH = 150;

export function normalizeActionNote(value: string) {
  return value.trim().slice(0, MAX_ACTION_NOTE_LENGTH);
}

export function mergeActionNotes(existing: string | null | undefined, actionNote: string) {
  const current = existing?.trim() ?? "";
  const confirmation = normalizeActionNote(actionNote);
  if (!confirmation) return current || null;
  return current ? `${current}\nConfirmation note: ${confirmation}` : confirmation;
}
