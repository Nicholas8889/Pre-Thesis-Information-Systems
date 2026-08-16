import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createCollectionTask: vi.fn(),
  createOutreach: vi.fn(),
  findCustomer: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  requireCurrentUser: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser
}));

vi.mock("@/lib/audit", () => ({
  createAuditTrailLog: mocks.audit
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collectionTask: { create: mocks.createCollectionTask },
    customer: { findUnique: mocks.findCustomer },
    customerOutreach: { create: mocks.createOutreach }
  }
}));

import { createCollectionTask, recordCustomerOutreach } from "../../src/lib/actions";

describe("renamed action audit records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user-1",
      role: "SALES",
      status: "Active"
    });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("records a Collection Task with the invoice number as Record Reference", async () => {
    mocks.createCollectionTask.mockResolvedValue({
      id: "collection-1",
      customerId: "customer-1",
      invoiceId: "invoice-1",
      scheduledDate: new Date("2026-08-20T00:00:00.000Z"),
      status: "Planned",
      notes: "Request payment confirmation",
      customer: { companyName: "Acme Indonesia" },
      invoice: { invoiceNumber: "INV-2026-001" }
    });

    const formData = new FormData();
    formData.set("customerId", "customer-1");
    formData.set("invoiceId", "invoice-1");
    formData.set("scheduledDate", "2026-08-20");
    formData.set("status", "Planned");
    formData.set("notes", "Request payment confirmation");

    await expect(createCollectionTask(formData)).rejects.toThrow("NEXT_REDIRECT:/collections");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Collections",
        entityType: "COLLECTION_TASK",
        entityId: "collection-1",
        recordReference: "INV-2026-001"
      })
    );
  });

  it("records Customer Outreach with the company as Record Reference", async () => {
    mocks.findCustomer.mockResolvedValue({
      id: "customer-1",
      companyName: "Acme Indonesia",
      name: "Ayu"
    });
    mocks.createOutreach.mockResolvedValue({
      id: "outreach-1",
      contactDate: new Date("2026-08-21T00:00:00.000Z"),
      notes: "Shared the product catalogue"
    });

    const formData = new FormData();
    formData.set("customerId", "customer-1");
    formData.set("contactDate", "2026-08-21");
    formData.set("notes", "Shared the product catalogue");

    await expect(recordCustomerOutreach(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-outreach"
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Customer Outreach",
        entityType: "CUSTOMER_OUTREACH",
        entityId: "outreach-1",
        recordReference: "Acme Indonesia"
      })
    );
  });
});
