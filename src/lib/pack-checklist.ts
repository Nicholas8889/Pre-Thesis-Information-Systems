type ChecklistItem = { id: string; isChecked: boolean };

export function isPackChecklistComplete(items: readonly ChecklistItem[]) {
  return items.length > 0 && items.every(item => item.isChecked);
}

// Unchecked HTML checkboxes are omitted. Require the exact row inventory and
// reject duplicate/unknown checks or attempts to submit the former quantity form.
export function parsePackChecklist(
  formData: FormData,
  canonicalItems: readonly { id: string }[],
): ChecklistItem[] | null {
  const ids = formData.getAll("itemId");
  const canonicalIds = new Set(canonicalItems.map(item => item.id));
  if (
    canonicalIds.size === 0 || ids.length !== canonicalIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some(id => typeof id !== "string" || !canonicalIds.has(id))
  ) return null;

  const checkedIds = formData.getAll("checkedItemId");
  if (
    new Set(checkedIds).size !== checkedIds.length ||
    checkedIds.some(id => typeof id !== "string" || !canonicalIds.has(id))
  ) return null;

  for (const key of formData.keys()) {
    if (["availability_", "available_", "packed_", "ordered_", "orderedQuantity_", "ordered_quantity_", "notes_"].some(prefix => key.startsWith(prefix))) return null;
    if (["packerName", "packageCount"].includes(key)) return null;
  }
  const checks = new Set(checkedIds);
  return canonicalItems.map(item => ({ id: item.id, isChecked: checks.has(item.id) }));
}
