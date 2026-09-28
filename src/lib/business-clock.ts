export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date()
};

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getBusinessDateWib(now = new Date()) {
  const jakarta = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  return new Date(
    Date.UTC(
      jakarta.getUTCFullYear(),
      jakarta.getUTCMonth(),
      jakarta.getUTCDate()
    ) - JAKARTA_OFFSET_MS
  );
}

export function getBusinessDateKeyWib(date: Date) {
  const jakarta = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return Date.UTC(
    jakarta.getUTCFullYear(),
    jakarta.getUTCMonth(),
    jakarta.getUTCDate()
  );
}

export function isBusinessDateAfterWib(left: Date, right: Date) {
  return getBusinessDateKeyWib(left) > getBusinessDateKeyWib(right);
}

export function isBusinessDateOnOrBeforeWib(left: Date, right: Date) {
  return getBusinessDateKeyWib(left) <= getBusinessDateKeyWib(right);
}

export function addBusinessDaysWib(date: Date, days: number) {
  return new Date(getBusinessDateWib(date).getTime() + days * DAY_MS);
}

export function subtractBusinessMonthsWib(date: Date, months: number) {
  const businessDate = getBusinessDateWib(date);
  const jakarta = new Date(businessDate.getTime() + JAKARTA_OFFSET_MS);
  const year = jakarta.getUTCFullYear();
  const month = jakarta.getUTCMonth();
  const day = jakarta.getUTCDate();
  const targetMonthIndex = month - months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth)) -
      JAKARTA_OFFSET_MS,
  );
}
