import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  customer: vi.fn(),
  invoice: vi.fn(),
  collectionCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: async () => ({
    id: "admin-1",
    username: "admin",
    displayName: "Admin",
    role: "ADMIN",
    status: "Active",
  }),
}));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { createCollectionTask, recordPayment } from "../../src/lib/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Batch 2 mutation validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async work => work({
      customer: { findFirst: mocks.customer },
      invoice: { findFirst: mocks.invoice },
      collectionTask: { create: mocks.collectionCreate },
    }));
  });

  it.each(["", "WireTransfer", "banktransfer", " BankTransfer "])(
    "rejects payment method %s before opening a transaction",
    async paymentMethod => {
      await expect(recordPayment(form({
        invoiceId: "invoice-1",
        amount: "1000",
        paymentDate: "2026-09-27",
        paymentMethod,
      }))).rejects.toThrow("valid%20payment%20method");
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it.each(["Done", "Cancelled", "Unknown", ""])(
    "rejects terminal or unknown Collection create state %s before mutation",
    async status => {
      await expect(createCollectionTask(form({
        customerId: "customer-1",
        invoiceId: "invoice-1",
        scheduledDate: "2026-09-27",
        status,
        notes: "Collect payment",
      }))).rejects.toThrow("Planned%20status");
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.collectionCreate).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it("rejects a cross-customer invoice inside the transaction without creating a task", async () => {
    mocks.customer.mockResolvedValue({ id: "customer-1" });
    mocks.invoice.mockResolvedValue(null);
    await expect(createCollectionTask(form({
      customerId: "customer-1",
      invoiceId: "invoice-from-customer-2",
      scheduledDate: "2026-09-27",
      status: "Planned",
      notes: "Collect payment",
    }))).rejects.toThrow("outside%20your%20portfolio");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.invoice).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "invoice-from-customer-2",
        customerId: "customer-1",
      }),
    }));
    expect(mocks.collectionCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
