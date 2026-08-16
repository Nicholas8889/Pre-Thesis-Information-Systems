import { redirect } from "next/navigation";
import { withSearchParams, type LegacySearchParams } from "@/lib/legacy-route";

export default async function LegacyBillingPage({
  searchParams
}: {
  searchParams?: Promise<LegacySearchParams>;
}) {
  redirect(withSearchParams("/collections", await searchParams));
}
