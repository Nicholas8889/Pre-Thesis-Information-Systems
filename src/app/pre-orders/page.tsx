import { redirect } from "next/navigation";
import { withAllowedSearchParams, type LegacySearchParams } from "@/lib/legacy-route";

const CUSTOMER_PO_QUERY_PARAMS = ["q", "tab", "paymentTermType"] as const;

export default async function LegacyPreOrdersPage({
  searchParams
}: {
  searchParams?: Promise<LegacySearchParams>;
}) {
  redirect(withAllowedSearchParams(
    "/customer-purchase-orders",
    await searchParams,
    CUSTOMER_PO_QUERY_PARAMS,
  ));
}
