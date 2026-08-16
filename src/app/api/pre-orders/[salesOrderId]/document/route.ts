import { GET as getCustomerPoDocument } from "@/app/api/customer-purchase-orders/[salesOrderId]/document/route";

// Compatibility API for existing links and clients.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ salesOrderId: string }> }
) {
  return getCustomerPoDocument(request, context);
}
