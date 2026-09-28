import {
  addBusinessDaysWib,
  getBusinessDateKeyWib,
  subtractBusinessMonthsWib,
} from "@/lib/business-clock";

export const CUSTOMER_PO_NOTIFICATION_ACTIVE_STATUSES = [
  "Draft",
  "Confirmed",
  "Invoiced",
  "Shipped",
] as const;

export const CUSTOMER_OUTREACH_ELIGIBLE_ORDER_STATUSES = [
  "Confirmed",
  "Invoiced",
  "Shipped",
] as const;

export function isCollectionDeadlineNotification(
  input: { status: string; deadline: Date },
  now = new Date(),
  daysAhead = 7
) {
  if (input.status !== "Planned") return false;
  return (
    getBusinessDateKeyWib(input.deadline) <=
    getBusinessDateKeyWib(addBusinessDaysWib(now, daysAhead))
  );
}

export function needsCustomerOutreach(latestOrderDate: Date | null, now = new Date()) {
  if (!latestOrderDate) return true;
  return (
    getBusinessDateKeyWib(latestOrderDate) <=
    getBusinessDateKeyWib(subtractBusinessMonthsWib(now, 3))
  );
}

export function isCustomerPoProcessingNotification(
  input: {
    requiredDate: Date | null;
    status: string;
    hasDeliveredDocument: boolean;
  },
  now = new Date(),
  daysAhead = 7
) {
  if (
    !input.requiredDate ||
    !CUSTOMER_PO_NOTIFICATION_ACTIVE_STATUSES.includes(
      input.status as (typeof CUSTOMER_PO_NOTIFICATION_ACTIVE_STATUSES)[number],
    ) ||
    input.hasDeliveredDocument
  ) {
    return false;
  }
  return (
    getBusinessDateKeyWib(input.requiredDate) <=
    getBusinessDateKeyWib(addBusinessDaysWib(now, daysAhead))
  );
}
