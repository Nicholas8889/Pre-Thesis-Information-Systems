import type { DeliveryNoteStatus } from "@prisma/client";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const deliveryNoteStatusLabels: Record<DeliveryNoteStatus, string> = {
  Draft: "Draft",
  Issued: "Dikirim",
  Delivered: "Diterima",
  Cancelled: "Dibatalkan"
};

export function getDeliveryNoteStatusLabel(status: DeliveryNoteStatus | string) {
  return deliveryNoteStatusLabels[status as DeliveryNoteStatus] ?? status;
}

export function parseJakartaDateTimeInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue = "0"] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const parsed = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - JAKARTA_OFFSET_MS
  );
  const jakartaParts = new Date(parsed.getTime() + JAKARTA_OFFSET_MS);

  if (
    jakartaParts.getUTCFullYear() !== year ||
    jakartaParts.getUTCMonth() !== month - 1 ||
    jakartaParts.getUTCDate() !== day ||
    jakartaParts.getUTCHours() !== hour ||
    jakartaParts.getUTCMinutes() !== minute ||
    jakartaParts.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
}

export function toJakartaDateTimeInputValue(date: Date) {
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 19);
}
