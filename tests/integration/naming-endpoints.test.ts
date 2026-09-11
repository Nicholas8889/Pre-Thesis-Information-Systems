import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  download: vi.fn(),
  findCustomerPo: vi.fn(),
  findSalesOrders: vi.fn()
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: mocks.currentUser
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOrder: {
      findFirst: mocks.findCustomerPo,
      findMany: mocks.findSalesOrders
    }
  }
}));

vi.mock("@/lib/customer-po-storage", () => ({
  downloadCustomerPoDocument: mocks.download
}));

import {
  createSalesOrderWorkbook,
  GET as getSalesOrderExport
} from "../../src/app/api/sales-orders/export/route";
import { GET as getCustomerPoDocument } from "../../src/app/api/customer-purchase-orders/[salesOrderId]/document/route";
import { GET as getLegacyCustomerPoDocument } from "../../src/app/api/pre-orders/[salesOrderId]/document/route";

const context = { params: Promise.resolve({ salesOrderId: "order-1" }) };

describe("canonical download endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ status: "Active" });
  });

  it("Excel export produces a valid xlsx with canonical Customer PO headers", async () => {
    const salesOrders = [
      {
        orderNumber: "SO-2026-001",
        customerPoNumber: "PO-2026-001",
        orderDate: new Date("2026-08-13T00:00:00.000Z"),
        status: "Confirmed",
        paymentTermType: "CREDIT",
        creditTermMonths: 2,
        subtotal: 100_000,
        total: 100_000,
        notes: null,
        customer: { companyName: "Acme Indonesia", name: "Ayu" },
        items: [
          {
            itemName: "Product A",
            quantity: 1,
            baseUnitPrice: 90_000,
            markupPercent: 20,
            discountPercent: 10,
            finalUnitPrice: 100_000,
            subtotal: 100_000
          }
        ],
        invoice: null,
        deliveryNotes: []
      }
    ];
    const workbook = createSalesOrderWorkbook({
      salesOrders: salesOrders as never,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T23:59:59.999Z"),
      exportedBy: "QA User",
      source: "CUSTOMER_PO"
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");

    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(buffer);
    expect(parsed.getWorksheet("Sales Orders")?.getCell("B5").value).toBe(
      "Customer PO Number"
    );
    expect(parsed.getWorksheet("Sales Orders")?.getCell("G6").value).toBe(
      "Credit – 2 Months"
    );
    expect(parsed.getWorksheet("Sales Order Items")?.getCell("G5").value).toBe(
      "Base Unit Price"
    );
    expect(parsed.getWorksheet("Sales Order Items")?.getCell("J5").value).toBe(
      "Final Unit Price"
    );

    mocks.currentUser.mockResolvedValueOnce({
      status: "Active",
      displayName: "QA User"
    });
    mocks.findSalesOrders.mockResolvedValueOnce(salesOrders);
    const response = await getSalesOrderExport(
      new NextRequest(
        "http://test.local/api/sales-orders/export?source=CUSTOMER_PO&startDate=2026-08-01&endDate=2026-08-31&tab=ongoing"
      )
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("content-disposition")).toContain(
      'attachment; filename="customer-purchase-orders-open-2026-08-01-2026-08-31.xlsx"'
    );
    const endpointBytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(endpointBytes[0], endpointBytes[1])).toBe("PK");
  });

  it("canonical and legacy Customer PO document routes return identical attachments", async () => {
    const fileBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    mocks.findCustomerPo.mockResolvedValue({
      customerPoDocumentName: "purchase-order.pdf",
      customerPoDocumentStoredName: "2026/08/purchase-order.pdf",
      customerPoDocumentMimeType: "application/pdf"
    });
    mocks.download.mockResolvedValue(fileBytes);

    const canonical = await getCustomerPoDocument(new Request("http://test.local"), context);
    const legacy = await getLegacyCustomerPoDocument(new Request("http://test.local"), context);

    expect(canonical.status).toBe(200);
    expect(legacy.status).toBe(200);
    expect(mocks.findCustomerPo).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1", source: "CUSTOMER_PO" }
      })
    );
    expect(canonical.headers.get("content-disposition")).toContain("attachment;");
    expect(canonical.headers.get("content-disposition")).toContain("purchase-order.pdf");
    expect(canonical.headers.get("x-content-type-options")).toBe("nosniff");
    expect(legacy.headers.get("content-disposition")).toBe(
      canonical.headers.get("content-disposition")
    );
    expect(new Uint8Array(await legacy.arrayBuffer())).toEqual(
      new Uint8Array(await canonical.arrayBuffer())
    );
  });

  it("rejects unauthenticated and unsafe Customer PO document requests", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    const unauthorized = await getCustomerPoDocument(
      new Request("http://test.local"),
      context
    );
    expect(unauthorized.status).toBe(401);

    mocks.currentUser.mockResolvedValueOnce({ status: "Active" });
    mocks.findCustomerPo.mockResolvedValueOnce({
      customerPoDocumentName: "unsafe.pdf",
      customerPoDocumentStoredName: "../unsafe.pdf",
      customerPoDocumentMimeType: "application/pdf"
    });
    const unsafe = await getCustomerPoDocument(new Request("http://test.local"), context);
    expect(unsafe.status).toBe(400);
    expect(mocks.download).not.toHaveBeenCalled();

    mocks.currentUser.mockResolvedValueOnce({ status: "Active" });
    mocks.findCustomerPo.mockResolvedValueOnce(null);
    const missing = await getCustomerPoDocument(new Request("http://test.local"), context);
    expect(missing.status).toBe(404);
  });
});
