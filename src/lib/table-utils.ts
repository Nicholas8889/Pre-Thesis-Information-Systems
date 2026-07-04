export function parseTableDate(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "-") return null;

  const numericMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const looksLikeDate =
    /^\d{4}-\d{1,2}-\d{1,2}/.test(normalized) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(normalized);
  if (!looksLikeDate) return null;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseTableNumber(value: string) {
  const normalized = value
    .replace(/Rp\s?/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  if (!normalized || !/[\d]/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareTableValues(left: string, right: string) {
  const leftDate = parseTableDate(left);
  const rightDate = parseTableDate(right);
  if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime();

  const leftNumber = parseTableNumber(left);
  const rightNumber = parseTableNumber(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;

  return left.trim().localeCompare(right.trim(), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

export function shouldOfferCheckboxFilter(values: string[]) {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length < 2) return false;

  const counts = new Map<string, number>();
  normalized.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  const uniqueCount = counts.size;
  const repeatedRowCount = normalized.length - uniqueCount;
  return (
    uniqueCount > 1 &&
    repeatedRowCount >= Math.max(1, Math.ceil(normalized.length * 0.2))
  );
}

export function getTablePageRange(totalRows: number, requestedPage: number, pageSize = 10) {
  const safeTotal = Math.max(0, Math.trunc(totalRows));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), totalPages);
  const start = (page - 1) * safePageSize;

  return {
    page,
    pageSize: safePageSize,
    totalPages,
    start,
    end: Math.min(start + safePageSize, safeTotal)
  };
}

export function shouldOfferTableTextExpansion(value: string, minimumLength = 40) {
  return value.trim().length > minimumLength;
}

export function haveSameOrderedReferences<T>(left: T[], right: T[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
