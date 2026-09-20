import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerPaymentBehaviour,
  getCustomerPaymentSummary,
  getJakartaTrailingTwelveMonthWindow
} from "@/lib/customer-intelligence";
import { customerInvoiceBalanceSelect } from "@/lib/customer-payment-query";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CustomerExportStatus = "ALL" | "Active" | "Inactive";

type CustomerExportRow = Prisma.CustomerGetPayload<{
  include: {
    invoices: { select: typeof customerInvoiceBalanceSelect };
    salesOrders: {
      select: {
        orderDate: true;
        status: true;
        paymentTermType: true;
        creditTermMonths: true;
      };
    };
  };
}>;

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser || currentUser.status !== "Active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const status = parseCustomerExportStatus(request.nextUrl.searchParams.get("status"));

  if (!status) {
    return NextResponse.json(
      { error: "A valid customer status is required." },
      { status: 400 }
    );
  }

  const exportedAt = new Date();
  const { observationStart, observationEnd } =
    getJakartaTrailingTwelveMonthWindow(exportedAt);
  const customers = await prisma.customer.findMany({
    where: getCustomerExportFilter(query, status),
    orderBy: [{ companyName: "asc" }, { name: "asc" }],
    include: {
      invoices: {
        where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
        select: customerInvoiceBalanceSelect
      },
      salesOrders: {
        where: {
          orderDate: { gte: observationStart, lte: observationEnd },
          status: { in: ["Confirmed", "Invoiced", "Shipped"] }
        },
        select: {
          orderDate: true,
          status: true,
          paymentTermType: true,
          creditTermMonths: true
        }
      }
    }
  });

  const workbook = createCustomerWorkbook({
    customers,
    exportedBy: currentUser.displayName,
    exportedAt,
    query,
    status
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const dateLabel = formatFileDate(exportedAt);
  const statusLabel = status === "ALL" ? "all" : status.toLowerCase();

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="customers-${statusLabel}-${dateLabel}.xlsx"`,
      "Cache-Control": "no-store"
    }
  });
}

export function getCustomerExportFilter(
  query: string,
  status: CustomerExportStatus
): Prisma.CustomerWhereInput {
  return {
    ...(status === "ALL" ? {} : { status }),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { companyName: { contains: query } },
            { phone: { contains: query } },
            { email: { contains: query } }
          ]
        }
      : {})
  };
}

export function createCustomerWorkbook({
  customers,
  exportedBy,
  exportedAt = new Date(),
  query,
  status
}: {
  customers: CustomerExportRow[];
  exportedBy: string;
  exportedAt?: Date;
  query: string;
  status: CustomerExportStatus;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CV Tajuk Revenue Cycle Information System";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  const worksheet = workbook.addWorksheet("Customers", {
    views: [{ state: "frozen", ySplit: 5 }]
  });
  worksheet.columns = [
    { header: "Contact Name", key: "contactName", width: 24 },
    { header: "Company", key: "company", width: 30 },
    { header: "NPWP", key: "npwp", width: 24 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Email", key: "email", width: 30 },
    { header: "Address", key: "address", width: 38 },
    { header: "Customer Segment", key: "customerSegment", width: 20 },
    { header: "Customer Status", key: "customerStatus", width: 17 },
    { header: "Payment Status", key: "paymentStatus", width: 22 },
    { header: "Outstanding Payment", key: "outstandingAmount", width: 22 },
    { header: "Open Invoices", key: "openInvoiceCount", width: 15 },
    { header: "Payment Behaviour (12 Months)", key: "paymentBehaviour", width: 29 },
    { header: "Eligible Orders (12 Months)", key: "eligibleOrderCount", width: 27 },
    { header: "Notes", key: "notes", width: 38 },
    { header: "Created At", key: "createdAt", width: 20 },
    { header: "Updated At", key: "updatedAt", width: 20 }
  ];

  worksheet.mergeCells("A1:P1");
  worksheet.getCell("A1").value = "CV TAJUK - CUSTOMER DATA";
  worksheet.mergeCells("A2:P2");
  worksheet.getCell("A2").value = `Filter: ${formatStatusLabel(status)}${query ? ` | Search: ${query}` : ""}`;
  worksheet.mergeCells("A3:P3");
  worksheet.getCell("A3").value = `Exported by ${exportedBy} on ${formatDateTime(exportedAt)}`;
  worksheet.getRow(5).values = [
    "Contact Name",
    "Company",
    "NPWP",
    "Phone",
    "Email",
    "Address",
    "Customer Segment",
    "Customer Status",
    "Payment Status",
    "Outstanding Payment",
    "Open Invoices",
    "Payment Behaviour (12 Months)",
    "Eligible Orders (12 Months)",
    "Notes",
    "Created At",
    "Updated At"
  ];

  for (const customer of customers) {
    const paymentSummary = getCustomerPaymentSummary(customer);
    const paymentBehaviour = getCustomerPaymentBehaviour(customer, exportedAt);
    worksheet.addRow({
      contactName: customer.name,
      company: customer.companyName,
      npwp: customer.npwp ?? "-",
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      customerSegment: customer.customerSegment,
      customerStatus: customer.status,
      paymentStatus: paymentSummary.paymentStatus,
      outstandingAmount: paymentSummary.outstandingAmount,
      openInvoiceCount: paymentSummary.openInvoiceCount,
      paymentBehaviour: paymentBehaviour.behaviour,
      eligibleOrderCount: paymentBehaviour.orderCount,
      notes: customer.notes ?? "",
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    });
  }

  styleCustomerWorksheet(worksheet, customers.length + 5);
  worksheet.autoFilter = `A5:P${Math.max(5, customers.length + 5)}`;
  return workbook;
}

function styleCustomerWorksheet(worksheet: ExcelJS.Worksheet, lastRow: number) {
  worksheet.getCell("A1").font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 16
  };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" }
  };
  worksheet.getCell("A1").alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 28;
  worksheet.getCell("A2").font = { bold: true, color: { argb: "FF334155" } };
  worksheet.getCell("A3").font = {
    color: { argb: "FF64748B" },
    italic: true
  };

  const headerRow = worksheet.getRow(5);
  headerRow.height = 24;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" }
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };

  for (let rowNumber = 6; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" }
      };
    }
  }

  worksheet.getColumn("J").numFmt = '[$Rp-421] #,##0';
  worksheet.getColumn("O").numFmt = "dd mmm yyyy hh:mm";
  worksheet.getColumn("P").numFmt = "dd mmm yyyy hh:mm";
}

function parseCustomerExportStatus(value: string | null): CustomerExportStatus | null {
  if (!value || value === "ALL") return "ALL";
  return value === "Active" || value === "Inactive" ? value : null;
}

function formatStatusLabel(status: CustomerExportStatus) {
  return status === "ALL" ? "All customer statuses" : `${status} customers`;
}

function formatFileDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
