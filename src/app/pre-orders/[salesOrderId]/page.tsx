import { redirect } from "next/navigation";

export default async function LegacyPreOrderDetailPage({
  params
}: {
  params: Promise<{ salesOrderId: string }>;
}) {
  const { salesOrderId } = await params;
  redirect(`/customer-purchase-orders/${encodeURIComponent(salesOrderId)}`);
}
