import type { CollectionTaskStatus } from "@prisma/client";

export const COLLECTION_TASK_INITIAL_STATUS = "Planned" as const;
export const COLLECTION_TASK_TERMINAL_STATUSES = ["Done", "Cancelled"] as const;

export function parseCollectionTaskVersion(value: unknown) {
  const rawValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!/^\d+$/.test(rawValue)) return null;
  const version = Number(rawValue);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export function parseCollectionTaskTransition(value: unknown) {
  return COLLECTION_TASK_TERMINAL_STATUSES.includes(
    value as (typeof COLLECTION_TASK_TERMINAL_STATUSES)[number]
  )
    ? (value as (typeof COLLECTION_TASK_TERMINAL_STATUSES)[number])
    : null;
}

export function canTransitionCollectionTask(
  currentStatus: CollectionTaskStatus,
  nextStatus: CollectionTaskStatus
) {
  return (
    currentStatus === COLLECTION_TASK_INITIAL_STATUS &&
    COLLECTION_TASK_TERMINAL_STATUSES.includes(
      nextStatus as (typeof COLLECTION_TASK_TERMINAL_STATUSES)[number]
    )
  );
}
