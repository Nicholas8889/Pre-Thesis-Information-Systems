"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ACTION_NOTE_LENGTH } from "@/lib/action-notes";
import { getActionConfirmationRules } from "@/lib/action-confirmation";

type PendingSubmission = {
  form: HTMLFormElement;
  submitter: HTMLButtonElement | HTMLInputElement | null;
  title: string;
  requiresNote: boolean;
};

export function ActionConfirmationDialog() {
  const [pending, setPending] = useState<PendingSubmission | null>(null);
  const [note, setNote] = useState("");
  const bypassForm = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.noActionConfirmation === "true") return;
      if (form.method.toLowerCase() === "get") return;
      if (bypassForm.current === form) {
        bypassForm.current = null;
        return;
      }

      event.preventDefault();
      const submitter =
        event.submitter instanceof HTMLButtonElement ||
        event.submitter instanceof HTMLInputElement
          ? event.submitter
          : null;
      const label =
        form.dataset.confirmTitle ||
        submitter?.getAttribute("title") ||
        submitter?.textContent?.trim() ||
        submitter?.getAttribute("value") ||
        "Submit Action";
      const destructive = getActionConfirmationRules({
        label,
        forceRequiredNote: form.dataset.confirmRequireNote === "true"
      }).requiresNote;

      setNote("");
      setPending({ form, submitter, title: label, requiresNote: destructive });
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, []);

  useEffect(() => {
    if (pending) textareaRef.current?.focus();
  }, [pending]);

  if (!pending) return null;

  const trimmedNote = note.trim();

  function cancel() {
    setPending(null);
    setNote("");
  }

  function submit() {
    if (!pending || (pending.requiresNote && !trimmedNote)) return;
    let noteInput = pending.form.querySelector<HTMLInputElement>(
      'input[name="confirmationNote"]'
    );
    if (!noteInput) {
      noteInput = document.createElement("input");
      noteInput.type = "hidden";
      noteInput.name = "confirmationNote";
      pending.form.append(noteInput);
    }
    noteInput.value = trimmedNote;
    bypassForm.current = pending.form;
    const { form, submitter } = pending;
    setPending(null);
    setNote("");
    form.requestSubmit(submitter ?? undefined);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-confirmation-title"
        className="w-full max-w-lg rounded-lg border border-line bg-white p-5 shadow-2xl"
      >
        <h2 id="action-confirmation-title" className="text-lg font-semibold text-ink">
          Confirm {pending.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review this action before submitting. Your note will be saved with the record and
          shown in the Audit Trail.
        </p>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Confirmation Note {pending.requiresNote ? "(required)" : "(optional)"}
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required={pending.requiresNote}
            rows={4}
            maxLength={MAX_ACTION_NOTE_LENGTH}
            placeholder={
              pending.requiresNote
                ? "Explain why this record is being deleted"
                : "Add a note for this action"
            }
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </label>
        <p className="mt-1 text-right text-xs font-medium text-slate-500">
          {note.length}/{MAX_ACTION_NOTE_LENGTH} characters
        </p>
        {pending.requiresNote && !trimmedNote && (
          <p className="mt-2 text-xs font-medium text-rose-600">
            A note is required for destructive actions.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending.requiresNote && !trimmedNote}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Submit
          </button>
        </div>
      </section>
    </div>
  );
}
