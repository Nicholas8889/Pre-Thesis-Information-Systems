import { redirect } from "next/navigation";
import { withSearchParams, type LegacySearchParams } from "@/lib/legacy-route";

export default async function LegacyPreOrdersPage({
  searchParams
}: {
  searchParams?: Promise<LegacySearchParams>;
}) {
  redirect(withSearchParams("/customer-purchase-orders", await searchParams));
}
