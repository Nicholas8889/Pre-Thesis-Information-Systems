import { OrdersBySourcePage } from "@/app/sales-orders/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerPurchaseOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return await OrdersBySourcePage({ searchParams, source: "CUSTOMER_PO" });
}
