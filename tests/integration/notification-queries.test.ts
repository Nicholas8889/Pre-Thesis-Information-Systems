import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  salesOrderFindMany: vi.fn(),
  collectionTaskFindMany: vi.fn(),
  customerFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOrder: { findMany: mocks.salesOrderFindMany },
    collectionTask: { findMany: mocks.collectionTaskFindMany },
    customer: { findMany: mocks.customerFindMany },
  },
}));

import { getRoleNotifications } from "../../src/lib/notifications";

const fixedClock = {
  now: () => new Date("2026-09-27T02:00:00.000Z"),
};

describe("role notification queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.salesOrderFindMany.mockResolvedValue([]);
    mocks.collectionTaskFindMany.mockResolvedValue([]);
    mocks.customerFindMany.mockResolvedValue([]);
  });

  it("scopes Sales sources in the database and keeps deterministic type/source ids", async () => {
    mocks.salesOrderFindMany.mockResolvedValue([
      {
        id: "po-1",
        orderNumber: "SO-PO-1",
        requiredDate: new Date("2026-10-04T00:00:00+07:00"),
        status: "Confirmed",
        customer: { companyName: "Portfolio A" },
        deliveryNotes: [],
        deliverySources: [],
      },
    ]);
    mocks.customerFindMany.mockResolvedValue([
      {
        id: "customer-1",
        companyName: "Portfolio A",
        salesOrders: [{ orderDate: new Date("2026-06-27T00:00:00+07:00") }],
      },
    ]);

    const first = await getRoleNotifications(
      { id: "sales-a", role: "SALES" },
      fixedClock,
    );
    const second = await getRoleNotifications(
      { id: "sales-a", role: "SALES" },
      fixedClock,
    );

    expect(first.map(({ id }) => id)).toEqual([
      "customer-po-processing:po-1",
      "customer-inactivity:customer-1",
    ]);
    expect(second.map(({ id }) => id)).toEqual(first.map(({ id }) => id));
    expect(new Set(first.map(({ id }) => id)).size).toBe(first.length);
    expect(first[0]?.href).toBe("/customer-purchase-orders/po-1");
    expect(mocks.salesOrderFindMany.mock.calls[0]?.[0].where).toMatchObject({
      createdByUserId: "sales-a",
      source: "CUSTOMER_PO",
    });
    expect(mocks.customerFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: "Active", portfolioOwnerUserId: "sales-a" },
      include: {
        salesOrders: {
          where: { status: { in: ["Confirmed", "Invoiced", "Shipped"] } },
        },
      },
    });
  });

  it("removes an Admin collection signal as soon as the source no longer matches", async () => {
    mocks.collectionTaskFindMany
      .mockResolvedValueOnce([
        {
          id: "collection-1",
          customerId: "customer-1",
          invoiceId: "invoice-1",
          scheduledDate: new Date("2026-10-04T00:00:00+07:00"),
          status: "Planned",
          customer: { companyName: "Customer" },
          invoice: { invoiceNumber: "INV-1" },
        },
      ])
      .mockResolvedValueOnce([]);

    const active = await getRoleNotifications(
      { id: "admin-1", role: "ADMIN" },
      fixedClock,
    );
    const refreshed = await getRoleNotifications(
      { id: "admin-1", role: "ADMIN" },
      fixedClock,
    );

    expect(active.map(({ id }) => id)).toEqual([
      "collection-deadline:collection-1",
    ]);
    expect(refreshed).toEqual([]);
    expect(mocks.collectionTaskFindMany.mock.calls[0]?.[0].where).toMatchObject({
      status: "Planned",
      scheduledDate: { lte: new Date("2026-10-03T17:00:00.000Z") },
    });
  });
});
