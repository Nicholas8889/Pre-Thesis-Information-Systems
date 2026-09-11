import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadCustomerPoDocument } from "@/lib/customer-po-storage";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ salesOrderId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.status !== "Active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { salesOrderId } = await params;
  const customerPo = await prisma.salesOrder.findFirst({
    where: { id: salesOrderId, source: "CUSTOMER_PO" },
    select: {
      customerPoDocumentName: true,
      customerPoDocumentStoredName: true,
      customerPoDocumentMimeType: true
    }
  });

  if (!customerPo?.customerPoDocumentStoredName) {
    return NextResponse.json({ error: "Customer PO document was not found" }, { status: 404 });
  }

  if (!isSafeStoragePath(customerPo.customerPoDocumentStoredName)) {
    return NextResponse.json({ error: "Invalid customer PO document path" }, { status: 400 });
  }

  const file = await downloadCustomerPoDocument(customerPo.customerPoDocumentStoredName);
  if (!file) {
    return NextResponse.json({ error: "Customer PO document file is unavailable" }, { status: 404 });
  }

  const downloadName = (customerPo.customerPoDocumentName ?? "customer-po-document").replace(
    /[\x00-\x1F\x7F"\\]/g,
    "_"
  );
  const asciiDownloadName = downloadName.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_");
  const encodedDownloadName = encodeURIComponent(downloadName).replace(/'/g, "%27");

  return new NextResponse(file, {
    headers: {
      "Content-Type": customerPo.customerPoDocumentMimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiDownloadName}"; filename*=UTF-8''${encodedDownloadName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isSafeStoragePath(value: string) {
  return !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}
