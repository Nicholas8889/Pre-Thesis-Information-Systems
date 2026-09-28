import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCustomers: vi.fn(),
  requireCurrentUser: vi.fn()
}));

vi.mock("@/lib/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: mocks.findCustomers }
  }
}));

import { CustomerOutreachPage } from "../../src/app/customer-activity-pages";

describe("Customer Outreach portfolio scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "sales-a",
      username: "sales-a",
      displayName: "Sales A",
      role: "SALES",
      status: "Active"
    });
    mocks.findCustomers.mockResolvedValue([]);
  });

  it("applies Sales ownership to dropdown, prefill, list, and search queries", async () => {
    await CustomerOutreachPage({
      searchParams: Promise.resolve({ customerId: "customer-b", q: "Portfolio B" })
    });

    expect(mocks.findCustomers).toHaveBeenCalledTimes(2);
    expect(mocks.findCustomers.mock.calls[0]?.[0]).toMatchObject({
      where: { portfolioOwnerUserId: "sales-a" }
    });
    expect(mocks.findCustomers.mock.calls[1]?.[0]).toMatchObject({
      where: {
        AND: [
          { portfolioOwnerUserId: "sales-a" },
          { OR: expect.any(Array) }
        ]
      }
    });
  });
});
