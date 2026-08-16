export const DEFAULT_PPN_RATE_BASIS_POINTS = 1100;
export const BASIS_POINTS_DENOMINATOR = 10_000;

export type TaxInclusiveAmounts = {
  ppnApplied: boolean;
  ppnRateBasisPoints: number;
  ppnAmount: number;
  netSalesAmount: number;
};

export type OrderTaxSnapshot = TaxInclusiveAmounts & {
  customerNpwpSnapshot: string | null;
};

export function getConfiguredPpnRateBasisPoints(
  configuredValue = process.env.PPN_RATE_BASIS_POINTS
) {
  if (configuredValue === undefined || configuredValue.trim() === "") {
    return DEFAULT_PPN_RATE_BASIS_POINTS;
  }

  const parsedValue = Number(configuredValue);
  assertValidBasisPoints(parsedValue);
  return parsedValue;
}

export function calculateTaxInclusiveAmounts({
  totalAmount,
  ppnApplied,
  ppnRateBasisPoints
}: {
  totalAmount: number;
  ppnApplied: boolean;
  ppnRateBasisPoints?: number;
}): TaxInclusiveAmounts {
  assertValidRupiahAmount(totalAmount);

  if (!ppnApplied) {
    return {
      ppnApplied: false,
      ppnRateBasisPoints: 0,
      ppnAmount: 0,
      netSalesAmount: totalAmount
    };
  }

  const resolvedRate =
    ppnRateBasisPoints ?? getConfiguredPpnRateBasisPoints();
  assertValidBasisPoints(resolvedRate);

  const netSalesAmount = Math.round(
    totalAmount * BASIS_POINTS_DENOMINATOR /
      (BASIS_POINTS_DENOMINATOR + resolvedRate)
  );

  return {
    ppnApplied: true,
    ppnRateBasisPoints: resolvedRate,
    ppnAmount: totalAmount - netSalesAmount,
    netSalesAmount
  };
}

export function buildOrderTaxSnapshot({
  totalAmount,
  customerNpwp,
  ppnRateBasisPoints
}: {
  totalAmount: number;
  customerNpwp: string | null | undefined;
  ppnRateBasisPoints?: number;
}): OrderTaxSnapshot {
  const customerNpwpSnapshot = customerNpwp?.trim() || null;

  return {
    customerNpwpSnapshot,
    ...calculateTaxInclusiveAmounts({
      totalAmount,
      ppnApplied: customerNpwpSnapshot !== null,
      ppnRateBasisPoints
    })
  };
}

export function formatPpnRate(ppnRateBasisPoints: number) {
  assertValidBasisPoints(ppnRateBasisPoints);
  return `${Number((ppnRateBasisPoints / 100).toFixed(2))}%`;
}

function assertValidBasisPoints(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS_DENOMINATOR) {
    throw new RangeError("PPN rate must be an integer from 0 to 10000 basis points");
  }
}

function assertValidRupiahAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Total amount must be a non-negative integer rupiah value");
  }
}
