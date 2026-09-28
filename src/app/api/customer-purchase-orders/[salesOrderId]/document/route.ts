import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadCustomerPoDocument } from "@/lib/customer-po-storage";
import { getCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";

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
  const portfolio = buildPortfolioScope(currentUser);

  const { salesOrderId } = await params;
  const customerPo = await prisma.salesOrder.findFirst({
    where: {
      id: salesOrderId,
      source: "CUSTOMER_PO",
      ...portfolio.salesOrderWhere
    },
    select: {
      customerPoDocumentName: true,
      customerPoDocumentStoredName: true,
      customerPoDocumentMimeType: true,
      customerPoDocumentSize: true,
      customerPoDocumentSha256: true
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
  if (
    (customerPo.customerPoDocumentSize != null && file.byteLength !== customerPo.customerPoDocumentSize) ||
    (customerPo.customerPoDocumentSha256 != null &&
      createHash("sha256").update(file).digest("hex") !== customerPo.customerPoDocumentSha256)
  ) {
    return NextResponse.json({ error: "Customer PO document integrity check failed" }, { status: 409 });
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
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `attachment; filename="${asciiDownloadName}"; filename*=UTF-8''${encodedDownloadName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isSafeStoragePath(value: string) {
  return /^customer-purchase-orders\/[A-Za-z0-9._-]+$/.test(value);
}
