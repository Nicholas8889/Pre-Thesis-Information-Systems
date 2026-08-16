import { redirect } from "next/navigation";
import { withSearchParams, type LegacySearchParams } from "@/lib/legacy-route";

export default async function LegacyFollowUpsPage({
  searchParams
}: {
  searchParams?: Promise<LegacySearchParams>;
}) {
  redirect(withSearchParams("/customer-outreach", await searchParams));
}
