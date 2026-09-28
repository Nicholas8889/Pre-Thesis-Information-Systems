import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findInvoice: vi.fn(),
  requireCurrentUser: vi.fn()
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));

vi.mock("@/lib/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findFirst: mocks.findInvoice }
  }
}));

import InvoicePrintPage from "../../src/app/invoices/[invoiceId]/print/page";

describe("invoice print authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "sales-a",
      username: "sales-a",
      displayName: "Sales A",
      role: "SALES",
      status: "Active"
    });
    mocks.findInvoice.mockResolvedValue(null);
  });

  it("queries a direct invoice id inside the authenticated Sales portfolio", async () => {
    await expect(
      InvoicePrintPage({ params: Promise.resolve({ invoiceId: "invoice-b" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.findInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "invoice-b",
          salesOrder: { createdByUserId: "sales-a" }
        }
      })
    );
  });
});
