import { OrderTransactionsPage } from "@/app/sales-orders/page";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PreOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return await OrderTransactionsPage({ searchParams, transactionType: "PRE_ORDER" });
}
