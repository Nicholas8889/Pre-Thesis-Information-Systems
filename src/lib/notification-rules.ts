export function isBillingDeadlineNotification(
  input: { status: string; deadline: Date },
  now = new Date(),
  daysAhead = 7
) {
  if (input.status !== "Planned") return false;
  const deadlineLimit = startOfDay(now);
  deadlineLimit.setDate(deadlineLimit.getDate() + daysAhead);
  return input.deadline <= deadlineLimit;
}

export function needsSalesCustomerFollowUp(latestOrderDate: Date | null, now = new Date()) {
  if (!latestOrderDate) return true;
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  return latestOrderDate < threeMonthsAgo;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
