import { OrdersBySourcePage } from "@/components/orders-by-source-page";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SalesOrdersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  return OrdersBySourcePage({ searchParams, source: "DIRECT" });
}
