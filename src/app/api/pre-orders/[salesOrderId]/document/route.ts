import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  const preOrder = await prisma.salesOrder.findFirst({
    where: { id: salesOrderId, transactionType: "PRE_ORDER" },
    select: {
      poDocumentName: true,
      poDocumentStoredName: true,
      poDocumentMimeType: true
    }
  });

  if (!preOrder?.poDocumentStoredName) {
    return NextResponse.json({ error: "PO document was not found" }, { status: 404 });
  }

  const safeStoredName = basename(preOrder.poDocumentStoredName);
  if (safeStoredName !== preOrder.poDocumentStoredName) {
    return NextResponse.json({ error: "Invalid PO document path" }, { status: 400 });
  }

  try {
    const file = await readFile(join(process.cwd(), "storage", "pre-orders", safeStoredName));
    const downloadName = (preOrder.poDocumentName ?? "po-document").replace(/["\r\n]/g, "_");
    const asciiDownloadName = downloadName
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_");
    const encodedDownloadName = encodeURIComponent(downloadName).replace(/'/g, "%27");
    return new NextResponse(file, {
      headers: {
        "Content-Type": preOrder.poDocumentMimeType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${asciiDownloadName}"; filename*=UTF-8''${encodedDownloadName}`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "PO document file is unavailable" }, { status: 404 });
  }
}
