const DAY_MS = 24 * 60 * 60 * 1000;

export type ProductCostEntry = {
  unitCost: number;
  effectiveFrom: Date;
};

export type ProductCostInsight = {
  latestProductionCost: number | null;
  averageProductionCost: number | null;
  coveredDays: number;
  periodLabel: string;
};

export function getProductCostWindow(now = new Date()) {
  const periodStart = new Date(now.getTime() - 30 * DAY_MS);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return {
    periodStart,
    periodEnd: now,
    periodLabel: `${formatter.format(periodStart)} – ${formatter.format(now)} (WIB)`
  };
}

// Weight by time in effect, not number of edits or units sold. The entry before
// the window remains applicable until the next recorded cost change.
export function getAverageProductionCost(
  history: readonly ProductCostEntry[],
  now = new Date()
): ProductCostInsight {
  const { periodStart, periodEnd, periodLabel } = getProductCostWindow(now);
  const entries = history
    .filter((entry) =>
      Number.isSafeInteger(entry.unitCost) && entry.unitCost >= 0 &&
      Number.isFinite(entry.effectiveFrom.getTime()) &&
      entry.effectiveFrom <= periodEnd
    )
    .toSorted((left, right) =>
      left.effectiveFrom.getTime() - right.effectiveFrom.getTime()
    );
  let weightedCost = 0;
  let coveredMs = 0;

  for (const [index, entry] of entries.entries()) {
    const start = Math.max(entry.effectiveFrom.getTime(), periodStart.getTime());
    const end = entries[index + 1]?.effectiveFrom.getTime() ?? periodEnd.getTime();
    const durationMs = Math.max(0, end - start);
    // Days keep the intermediate multiplication small for rupiah amounts.
    weightedCost += entry.unitCost * (durationMs / DAY_MS);
    coveredMs += durationMs;
  }

  const coveredDays = coveredMs / DAY_MS;
  return {
    latestProductionCost: entries.at(-1)?.unitCost ?? null,
    averageProductionCost: coveredDays > 0
      ? Math.round(weightedCost / coveredDays)
      : null,
    coveredDays,
    periodLabel
  };
}

export function getProductCostCoverageText(insight: ProductCostInsight) {
  if (insight.averageProductionCost === null) {
    return `No production cost history available for ${insight.periodLabel}.`;
  }
  const days = insight.coveredDays < 0.1 ? "Less than 0.1" : insight.coveredDays.toLocaleString("en-US", {
    maximumFractionDigits: 1
  });
  return `${days} day(s) of cost history · ${insight.periodLabel}. Weighted by time in effect.`;
}

export function getProductionCostComparison(
  proposedUnitPriceExcludingPpn: number | null,
  averageProductionCost: number | null
) {
  if (proposedUnitPriceExcludingPpn === null || averageProductionCost === null) {
    return { absoluteDifference: null, percentageDifference: null };
  }
  const absoluteDifference = proposedUnitPriceExcludingPpn - averageProductionCost;
  return {
    absoluteDifference,
    percentageDifference: averageProductionCost === 0
      ? null
      : Math.round(absoluteDifference / averageProductionCost * 1000) / 10
  };
}
