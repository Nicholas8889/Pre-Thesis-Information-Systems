export type PopularProduct = {
  name: string;
  quantity: number;
};

export const PRODUCT_AVERAGE_ELIGIBLE_STATUSES = [
  "Confirmed",
  "Invoiced",
  "Shipped"
] as const;

export type CurrentMonthAverageSoldPrice = {
  averageSoldPrice: number | null;
  eligibleQuantity: number;
  eligibleSalesValue: number;
  monthLabel: string;
  monthStart: Date;
  nextMonthStart: Date;
};

export type ProductPriceComparison = {
  absoluteDifference: number | null;
  percentageDifference: number | null;
};

const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function getJakartaCurrentMonthWindow(now = new Date()) {
  const jakartaNow = new Date(now.getTime() + JAKARTA_UTC_OFFSET_MS);
  const year = jakartaNow.getUTCFullYear();
  const month = jakartaNow.getUTCMonth();

  return {
    monthStart: new Date(Date.UTC(year, month, 1) - JAKARTA_UTC_OFFSET_MS),
    nextMonthStart: new Date(Date.UTC(year, month + 1, 1) - JAKARTA_UTC_OFFSET_MS),
    monthLabel: new Intl.DateTimeFormat("en-US", {
      timeZone: JAKARTA_TIME_ZONE,
      month: "long",
      year: "numeric"
    }).format(now)
  };
}

export function getCurrentMonthAverageSoldPrice(
  productId: string,
  items: Array<{
    productId: string | null;
    quantity: number;
    subtotal: number;
    salesOrder: {
      orderDate: Date;
      status: string;
    };
  }>,
  now = new Date()
): CurrentMonthAverageSoldPrice {
  const { monthStart, nextMonthStart } = getJakartaCurrentMonthWindow(now);
  const eligibleStatuses = new Set<string>(PRODUCT_AVERAGE_ELIGIBLE_STATUSES);
  let eligibleQuantity = 0;
  let eligibleSalesValue = 0;

  for (const item of items) {
    if (
      item.productId !== productId ||
      !eligibleStatuses.has(item.salesOrder.status) ||
      item.salesOrder.orderDate < monthStart ||
      item.salesOrder.orderDate >= nextMonthStart ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.subtotal) ||
      item.subtotal < 0
    ) {
      continue;
    }

    eligibleQuantity += item.quantity;
    eligibleSalesValue += item.subtotal;
  }

  return getCurrentMonthAverageSoldPriceFromAggregate(
    { eligibleQuantity, eligibleSalesValue },
    now
  );
}

export function getCurrentMonthAverageSoldPriceFromAggregate(
  {
    eligibleQuantity,
    eligibleSalesValue
  }: {
    eligibleQuantity: number;
    eligibleSalesValue: number;
  },
  now = new Date()
): CurrentMonthAverageSoldPrice {
  const { monthStart, nextMonthStart, monthLabel } =
    getJakartaCurrentMonthWindow(now);

  return {
    averageSoldPrice:
      eligibleQuantity > 0
        ? Math.round(eligibleSalesValue / eligibleQuantity)
        : null,
    eligibleQuantity,
    eligibleSalesValue,
    monthLabel,
    monthStart,
    nextMonthStart
  };
}

export function getProductPriceComparison(
  proposedUnitPrice: number,
  averageSoldPrice: number | null
): ProductPriceComparison {
  if (averageSoldPrice === null) {
    return {
      absoluteDifference: null,
      percentageDifference: null
    };
  }

  const absoluteDifference = proposedUnitPrice - averageSoldPrice;

  return {
    absoluteDifference,
    percentageDifference:
      averageSoldPrice === 0
        ? null
        : (absoluteDifference / averageSoldPrice) * 100
  };
}

export function buildPopularProducts(
  items: Array<{ itemName: string; quantity: number }>,
  limit = 5
): PopularProduct[] {
  const products = new Map<string, PopularProduct>();

  for (const item of items) {
    const name = item.itemName.trim();
    if (!name || item.quantity <= 0) continue;

    const key = name.toLowerCase();
    const existing = products.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      products.set(key, { name, quantity: item.quantity });
    }
  }

  return [...products.values()]
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}
