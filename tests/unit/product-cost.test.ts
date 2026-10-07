import { describe, expect, it } from "vitest";
import {
  getAverageProductionCost,
  getProductCostWindow,
  getProductionCostComparison
} from "../../src/lib/product-cost";

const now = new Date("2026-10-04T05:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("production cost over the last 30 days", () => {
  it("weights costs by time rather than by edit count", () => {
    expect(getAverageProductionCost([
      { unitCost: 10_000, effectiveFrom: daysAgo(30) },
      { unitCost: 12_000, effectiveFrom: daysAgo(10) }
    ], now)).toMatchObject({
      averageProductionCost: 10_667,
      latestProductionCost: 12_000,
      coveredDays: 30
    });
  });

  it("carries the last cost from before the window without averaging older costs", () => {
    expect(getAverageProductionCost([
      { unitCost: 999_999, effectiveFrom: daysAgo(100) },
      { unitCost: 10_000, effectiveFrom: daysAgo(60) },
      { unitCost: 12_000, effectiveFrom: daysAgo(10) }
    ], now).averageProductionCost).toBe(10_667);
  });

  it("uses only known coverage for a newly recorded product", () => {
    expect(getAverageProductionCost([
      { unitCost: 12_000, effectiveFrom: daysAgo(10) }
    ], now)).toMatchObject({ averageProductionCost: 12_000, coveredDays: 10 });
    expect(getAverageProductionCost([], now)).toMatchObject({
      averageProductionCost: null, latestProductionCost: null, coveredDays: 0
    });
  });

  it("ignores future and invalid costs, accepts zero, and does not mutate history", () => {
    const history = [
      { unitCost: 5_000, effectiveFrom: daysAgo(-1) },
      { unitCost: 0, effectiveFrom: daysAgo(40) },
      { unitCost: -1, effectiveFrom: daysAgo(10) }
    ];
    expect(getAverageProductionCost(history, now)).toMatchObject({
      averageProductionCost: 0, latestProductionCost: 0, coveredDays: 30
    });
    expect(history[0].unitCost).toBe(5_000);
  });

  it("weights intraday changes and remains a rolling window across month boundaries", () => {
    expect(getAverageProductionCost([
      { unitCost: 10_000, effectiveFrom: daysAgo(1) },
      { unitCost: 12_000, effectiveFrom: daysAgo(0.5) }
    ], now)).toMatchObject({ averageProductionCost: 11_000, coveredDays: 1 });
    expect(getProductCostWindow(now).periodStart).toEqual(daysAgo(30));
    expect(getProductCostWindow(new Date("2026-09-30T18:00:00Z")).periodLabel)
      .toContain("1 Oct 2026");
  });

  it("compares selling price excluding tax against cost, with a cost percentage denominator", () => {
    expect(getProductionCostComparison(15_000, 10_000)).toEqual({
      absoluteDifference: 5_000, percentageDifference: 50
    });
    expect(getProductionCostComparison(8_000, 10_000).absoluteDifference).toBe(-2_000);
    expect(getProductionCostComparison(1_000, 0).percentageDifference).toBeNull();
    expect(getProductionCostComparison(null, 10_000).absoluteDifference).toBeNull();
    expect(getProductionCostComparison(10_000, null).absoluteDifference).toBeNull();
  });
});
