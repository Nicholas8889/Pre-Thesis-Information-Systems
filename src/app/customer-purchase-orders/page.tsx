import { OrdersBySourcePage } from "@/components/orders-by-source-page";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerPurchaseOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return await OrdersBySourcePage({ searchParams, source: "CUSTOMER_PO" });
}
