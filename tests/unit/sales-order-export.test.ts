import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  createSalesOrderWorkbook,
  getSalesOrderExportTabFilter
} from "../../src/app/api/sales-orders/export/route";

describe("sales order Excel export", () => {
  it("maps each process tab to the matching database filter", () => {
    expect(getSalesOrderExportTabFilter("approval")).toEqual({
      approvalStatus: "Pending"
    });
    expect(getSalesOrderExportTabFilter("ongoing")).toEqual({
      approvalStatus: { not: "Pending" },
      status: { in: ["Draft", "Confirmed", "Invoiced"] },
      deliveryNotes: { none: {} },
      deliverySources: { none: {} }
    });
    expect(getSalesOrderExportTabFilter("done")).toEqual({
      OR: [
        { status: { in: ["Shipped", "Cancelled"] } },
        { deliveryNotes: { some: {} } },
        { deliverySources: { some: {} } }
      ]
    });
  });

  it("produces a valid xlsx workbook with canonical pricing headers", async () => {
    const workbook = createSalesOrderWorkbook({
      salesOrders: [
        {
          orderNumber: "SO-TEST-001",
          customerPoNumber: null,
          orderDate: new Date("2026-08-13T00:00:00.000Z"),
          status: "Confirmed",
          paymentTermType: "IMMEDIATE",
          creditTermMonths: null,
          subtotal: 120_000,
          total: 120_000,
          notes: null,
          customer: {
            companyName: "Test Company",
            name: "Test Contact"
          },
          items: [
            {
              itemName: "Test Product",
              quantity: 2,
              baseUnitPrice: 50_000,
              markupPercent: 20,
              discountPercent: 0,
              finalUnitPrice: 60_000,
              subtotal: 120_000
            }
          ],
          invoice: null,
          deliveryNotes: []
        }
      ] as never,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T23:59:59.999Z"),
      exportedBy: "Test User",
      source: "DIRECT"
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    expect(reloaded.worksheets.map((sheet) => sheet.name)).toEqual([
      "Sales Orders",
      "Sales Order Items"
    ]);

    const itemHeaders = reloaded
      .getWorksheet("Sales Order Items")
      ?.getRow(5)
      .values;
    expect(itemHeaders).toContain("Base Unit Price");
    expect(itemHeaders).toContain("Final Unit Price");
  });
});
