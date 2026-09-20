import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  findCustomers: vi.fn()
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: mocks.currentUser
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: {
      findMany: mocks.findCustomers
    }
  }
}));

import {
  createCustomerWorkbook,
  GET,
  getCustomerExportFilter
} from "../../src/app/api/customers/export/route";

describe("customer Excel export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds filters for status and the same searchable customer fields as the page", () => {
    expect(getCustomerExportFilter("", "ALL")).toEqual({});
    expect(getCustomerExportFilter("acme", "Active")).toEqual({
      status: "Active",
      OR: [
        { name: { contains: "acme" } },
        { companyName: { contains: "acme" } },
        { phone: { contains: "acme" } },
        { email: { contains: "acme" } }
      ]
    });
  });

  it("produces a valid workbook with typed customer and payment data", async () => {
    const exportedAt = new Date("2026-09-20T05:00:00.000Z");
    const workbook = createCustomerWorkbook({
      customers: [
        {
          id: "customer-1",
          name: "Ayu",
          companyName: "Acme Indonesia",
          npwp: "012345678901234",
          phone: "08123456789",
          email: "ayu@example.com",
          address: "Jakarta",
          customerSegment: "Retail",
          status: "Active",
          notes: "Priority customer",
          createdAt: new Date("2026-01-02T03:00:00.000Z"),
          updatedAt: new Date("2026-09-19T03:00:00.000Z"),
          invoices: [
            {
              remainingAmount: 250_000,
              status: "Partially Paid",
              deliverySources: [],
              deliveryNotes: [{ status: "Delivered" }],
              salesOrder: { deliveryNotes: [] }
            }
          ],
          salesOrders: [
            {
              orderDate: new Date("2026-08-01T03:00:00.000Z"),
              status: "Confirmed",
              paymentTermType: "CREDIT",
              creditTermMonths: 2
            }
          ]
        }
      ] as never,
      exportedBy: "QA User",
      exportedAt,
      query: "acme",
      status: "Active"
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");

    const parsed = new ExcelJS.Workbook();
    await parsed.xlsx.load(buffer);
    const sheet = parsed.getWorksheet("Customers");
    expect(sheet?.getCell("B6").value).toBe("Acme Indonesia");
    expect(sheet?.getCell("I6").value).toBe("Outstanding Payment");
    expect(sheet?.getCell("J6").value).toBe(250_000);
    expect(sheet?.getCell("K6").value).toBe(1);
    expect(sheet?.getCell("L6").value).toBe("Long-Term Credit");
    expect(sheet?.getCell("O6").value).toBeInstanceOf(Date);
    expect(sheet?.autoFilter).toBe("A5:P6");
  });

  it("requires an active user and validates the requested status", async () => {
    mocks.currentUser.mockResolvedValueOnce(null);
    const unauthorized = await GET(
      new NextRequest("http://test.local/api/customers/export?status=ALL")
    );
    expect(unauthorized.status).toBe(401);

    mocks.currentUser.mockResolvedValueOnce({
      status: "Active",
      displayName: "QA User"
    });
    const invalid = await GET(
      new NextRequest("http://test.local/api/customers/export?status=Archived")
    );
    expect(invalid.status).toBe(400);
    expect(mocks.findCustomers).not.toHaveBeenCalled();
  });

  it("downloads filtered customer data as an xlsx attachment", async () => {
    mocks.currentUser.mockResolvedValueOnce({
      status: "Active",
      displayName: "QA User"
    });
    mocks.findCustomers.mockResolvedValueOnce([]);

    const response = await GET(
      new NextRequest(
        "http://test.local/api/customers/export?status=Inactive&q=acme"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /attachment; filename="customers-inactive-\d{4}-\d{2}-\d{2}\.xlsx"/
    );
    expect(mocks.findCustomers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: getCustomerExportFilter("acme", "Inactive")
      })
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
