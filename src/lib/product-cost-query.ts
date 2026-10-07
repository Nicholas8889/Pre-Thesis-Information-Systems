import type { PrismaClient } from "@prisma/client";
import {
  getAverageProductionCost,
  getProductCostWindow,
  type ProductCostEntry,
  type ProductCostInsight
} from "@/lib/product-cost";

type CostClient = Pick<PrismaClient, "product" | "productCostHistory">;

export async function loadProductCostInsights(
  db: CostClient,
  productIds: string[],
  now = new Date()
): Promise<Map<string, ProductCostInsight>> {
  if (productIds.length === 0) return new Map<string, ProductCostInsight>();
  const { periodStart } = getProductCostWindow(now);
  // One pre-window cost per product plus only changes inside the window.
  const [baselines, changes] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        costHistory: {
          where: { effectiveFrom: { lt: periodStart } },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { unitCost: true, effectiveFrom: true }
        }
      }
    }),
    db.productCostHistory.findMany({
      where: {
        productId: { in: productIds },
        effectiveFrom: { gte: periodStart, lte: now }
      },
      orderBy: { effectiveFrom: "asc" },
      select: { productId: true, unitCost: true, effectiveFrom: true }
    })
  ]);
  const historyByProduct = new Map<string, ProductCostEntry[]>(
    baselines.map((product) => [product.id, [...product.costHistory]])
  );
  for (const change of changes) {
    historyByProduct.get(change.productId)?.push(change);
  }
  return new Map(productIds.map((id) => [
    id,
    getAverageProductionCost(historyByProduct.get(id) ?? [], now)
  ]));
}
