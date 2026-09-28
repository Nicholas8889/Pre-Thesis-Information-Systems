import type { PickingItemAvailability } from "@prisma/client";

type CanonicalPickingItem = {
  id: string;
  orderedQuantity: number;
};

export type ParsedPickingItem = CanonicalPickingItem & {
  availabilityStatus: PickingItemAvailability;
  availableQuantity: number;
  packedQuantity: number;
  notes: string | null;
};

const EDITABLE_PREFIXES = ["availability_", "available_", "packed_", "notes_"] as const;
const FORBIDDEN_ORDERED_PREFIXES = ["ordered_", "orderedQuantity_", "ordered_quantity_"] as const;

function singleText(formData: FormData, key: string): string | null {
  const values = formData.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0].trim()
    : null;
}

export function parseExactPickingItems(
  formData: FormData,
  canonicalItems: readonly CanonicalPickingItem[],
): ParsedPickingItem[] | null {
  const submittedIds = formData.getAll("itemId");
  if (
    submittedIds.length !== canonicalItems.length ||
    submittedIds.some(value => typeof value !== "string" || !value.trim())
  ) {
    return null;
  }

  const normalizedIds = submittedIds.map(value => String(value).trim());
  const submittedSet = new Set(normalizedIds);
  const canonicalSet = new Set(canonicalItems.map(item => item.id));
  if (
    submittedSet.size !== normalizedIds.length ||
    submittedSet.size !== canonicalSet.size ||
    [...submittedSet].some(id => !canonicalSet.has(id))
  ) {
    return null;
  }

  for (const key of formData.keys()) {
    if (FORBIDDEN_ORDERED_PREFIXES.some(prefix => key.startsWith(prefix))) return null;
    const prefix = EDITABLE_PREFIXES.find(candidate => key.startsWith(candidate));
    if (prefix && !canonicalSet.has(key.slice(prefix.length))) return null;
  }

  const parsed = canonicalItems.map(item => {
    const availabilityStatus = singleText(formData, `availability_${item.id}`);
    const available = singleText(formData, `available_${item.id}`);
    const packed = singleText(formData, `packed_${item.id}`);
    const notes = singleText(formData, `notes_${item.id}`);
    if (
      availabilityStatus === null ||
      available === null ||
      packed === null ||
      notes === null ||
      !/^\d+$/.test(available) ||
      !/^\d+$/.test(packed)
    ) {
      return null;
    }

    return {
      id: item.id,
      orderedQuantity: item.orderedQuantity,
      availabilityStatus: availabilityStatus as PickingItemAvailability,
      availableQuantity: Number(available),
      packedQuantity: Number(packed),
      notes: notes || null,
    };
  });

  return parsed.every((item): item is ParsedPickingItem => item !== null)
    ? parsed
    : null;
}
