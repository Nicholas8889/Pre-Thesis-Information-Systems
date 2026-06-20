export type PopularProduct = {
  name: string;
  quantity: number;
};

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
