import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getPaymentTermLabel } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SalesOrderExportRow = Prisma.SalesOrderGetPayload<{
  include: {
    customer: true;
    items: true;
    invoice: true;
    deliveryNotes: {
      select: {
        deliveryNoteNumber: true;
        status: true;
      };
    };
  };
}>;

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.status !== "Active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startDateValue = request.nextUrl.searchParams.get("startDate");
  const endDateValue = request.nextUrl.searchParams.get("endDate");
  const transactionType =
    request.nextUrl.searchParams.get("transactionType") === "PRE_ORDER"
      ? "PRE_ORDER"
      : "SALES_ORDER";
  const startDate = parseLocalDate(startDateValue, false);
  const endDate = parseLocalDate(endDateValue, true);

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "A valid start date and end date are required." },
      { status: 400 }
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "Start date cannot be after end date." },
      { status: 400 }
    );
  }

  const salesOrders = await prisma.salesOrder.findMany({
    where: {
      transactionType,
      orderDate: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: [{ orderDate: "asc" }, { orderNumber: "asc" }],
    include: {
      customer: true,
      items: true,
      invoice: true,
      deliveryNotes: {
        select: {
          deliveryNoteNumber: true,
          status: true
        }
      }
    }
  });

  const workbook = createSalesOrderWorkbook({
    salesOrders,
    startDate,
    endDate,
    exportedBy: currentUser.displayName,
    transactionType
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${transactionType === "PRE_ORDER" ? "pre-orders" : "sales-orders"}-${startDateValue}-${endDateValue}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}

function createSalesOrderWorkbook({
  salesOrders,
  startDate,
  endDate,
  exportedBy,
  transactionType
}: {
  salesOrders: SalesOrderExportRow[];
  startDate: Date;
  endDate: Date;
  exportedBy: string;
  transactionType: "SALES_ORDER" | "PRE_ORDER";
}) {
  const transactionLabel = transactionType === "PRE_ORDER" ? "PRE ORDER" : "SALES ORDER";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CV Tajuk Revenue Cycle MVP";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet("Sales Orders", {
    views: [{ state: "frozen", ySplit: 5 }]
  });
  summary.columns = [
    { header: "Order Number", key: "orderNumber", width: 20 },
    { header: "PO ID", key: "poNumber", width: 20 },
    { header: "Order Date", key: "orderDate", width: 14 },
    { header: "Customer", key: "customer", width: 28 },
    { header: "Contact Name", key: "contactName", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Payment Term", key: "paymentTerm", width: 18 },
    { header: "Subtotal", key: "subtotal", width: 16 },
    { header: "Total", key: "total", width: 16 },
    { header: "Invoice", key: "invoice", width: 20 },
    { header: "Invoice Status", key: "invoiceStatus", width: 16 },
    { header: "Surat Jalan", key: "deliveryNotes", width: 28 },
    { header: "Notes", key: "notes", width: 36 }
  ];

  summary.mergeCells("A1:M1");
  summary.getCell("A1").value = `CV TAJUK - ${transactionLabel} DATA`;
  summary.mergeCells("A2:M2");
  summary.getCell("A2").value = `Date range: ${formatDateForWorkbook(startDate)} to ${formatDateForWorkbook(endDate)}`;
  summary.mergeCells("A3:M3");
  summary.getCell("A3").value = `Exported by ${exportedBy} on ${formatDateForWorkbook(new Date())}`;
  summary.getRow(5).values = [
    "Order Number",
    "PO ID",
    "Order Date",
    "Customer",
    "Contact Name",
    "Status",
    "Payment Term",
    "Subtotal",
    "Total",
    "Invoice",
    "Invoice Status",
    "Surat Jalan",
    "Notes"
  ];

  for (const order of salesOrders) {
    summary.addRow({
      orderNumber: order.orderNumber,
      poNumber: order.poNumber ?? "-",
      orderDate: order.orderDate,
      customer: order.customer.companyName,
      contactName: order.customer.name,
      status: order.status,
      paymentTerm: getPaymentTermLabel(order),
      subtotal: order.subtotal,
      total: order.total,
      invoice: order.invoice?.invoiceNumber ?? "-",
      invoiceStatus: order.invoice?.status ?? "No Invoice",
      deliveryNotes: order.deliveryNotes.map((note) => `${note.deliveryNoteNumber} (${note.status})`).join(", ") || "-",
      notes: order.notes ?? ""
    });
  }

  styleWorksheet(summary, salesOrders.length + 5, ["H", "I"], "C");
  summary.autoFilter = `A5:M${Math.max(5, salesOrders.length + 5)}`;

  const items = workbook.addWorksheet("Sales Order Items", {
    views: [{ state: "frozen", ySplit: 5 }]
  });
  items.columns = [
    { header: "Order Number", key: "orderNumber", width: 20 },
    { header: "PO ID", key: "poNumber", width: 20 },
    { header: "Order Date", key: "orderDate", width: 14 },
    { header: "Customer", key: "customer", width: 28 },
    { header: "Item Name", key: "itemName", width: 32 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Base Price", key: "basePrice", width: 16 },
    { header: "Markup (%)", key: "markupPercent", width: 14 },
    { header: "Discount (%)", key: "discountPercent", width: 14 },
    { header: "Unit Price", key: "unitPrice", width: 16 },
    { header: "Item Subtotal", key: "itemSubtotal", width: 18 },
    { header: "Order Total", key: "orderTotal", width: 16 }
  ];
  items.mergeCells("A1:L1");
  items.getCell("A1").value = `CV TAJUK - ${transactionLabel} ITEM DETAILS`;
  items.mergeCells("A2:L2");
  items.getCell("A2").value = `Date range: ${formatDateForWorkbook(startDate)} to ${formatDateForWorkbook(endDate)}`;
  items.mergeCells("A3:L3");
  items.getCell("A3").value = `${salesOrders.length} ${transactionType === "PRE_ORDER" ? "Pre Order" : "Sales Order"}(s)`;
  items.getRow(5).values = [
    "Order Number",
    "PO ID",
    "Order Date",
    "Customer",
    "Item Name",
    "Quantity",
    "Base Price",
    "Markup (%)",
    "Discount (%)",
    "Unit Price",
    "Item Subtotal",
    "Order Total"
  ];

  for (const order of salesOrders) {
    for (const item of order.items) {
      items.addRow({
        orderNumber: order.orderNumber,
        poNumber: order.poNumber ?? "-",
        orderDate: order.orderDate,
        customer: order.customer.companyName,
        itemName: item.itemName,
        quantity: item.quantity,
        basePrice: item.basePrice,
        markupPercent: item.markupPercent,
        discountPercent: item.discountPercent,
        unitPrice: item.unitPrice,
        itemSubtotal: item.subtotal,
        orderTotal: order.total
      });
    }
  }

  const itemRowCount = salesOrders.reduce((sum, order) => sum + order.items.length, 0);
  styleWorksheet(items, itemRowCount + 5, ["G", "J", "K", "L"], "C");
  items.getColumn("H").numFmt = '0"%"';
  items.getColumn("I").numFmt = '0"%"';
  items.autoFilter = `A5:L${Math.max(5, itemRowCount + 5)}`;

  return workbook;
}

function styleWorksheet(
  worksheet: ExcelJS.Worksheet,
  lastRow: number,
  currencyColumns: string[],
  dateColumn = "B"
) {
  worksheet.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  worksheet.getCell("A1").alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 28;
  worksheet.getCell("A2").font = { bold: true, color: { argb: "FF334155" } };
  worksheet.getCell("A3").font = { color: { argb: "FF64748B" }, italic: true };

  const headerRow = worksheet.getRow(5);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  headerRow.alignment = { vertical: "middle" };

  for (let rowNumber = 6; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
  }

  worksheet.getColumn(dateColumn).numFmt = "dd mmm yyyy";
  for (const column of currencyColumns) {
    worksheet.getColumn(column).numFmt = '[$Rp-421] #,##0';
  }
}

function parseLocalDate(value: string | null, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function formatDateForWorkbook(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
