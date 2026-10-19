import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "sales-1", role: "ADMIN" },
  customer: vi.fn(), products: vi.fn(), inquiry: vi.fn(), create: vi.fn(),
  update: vi.fn(), claim: vi.fn(), price: vi.fn(), transaction: vi.fn(),
  audit: vi.fn(), sequence: vi.fn(), lock: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => mocks.actor }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  customer: { findFirst: mocks.customer }, product: { findMany: mocks.products },
  customerInquiry: { findFirst: mocks.inquiry, create: mocks.create, update: mocks.update, updateMany: mocks.claim },
  customerInquiryItem: { update: mocks.price }, documentSequence: { upsert: mocks.sequence },
  $transaction: mocks.transaction, $queryRaw: mocks.lock
} }));

import { createCustomerInquiry, createSalesOrder, updateCustomerInquiryPrices, updateCustomerInquiryStatus } from "../../src/lib/actions";
import { prisma } from "../../src/lib/prisma";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const item = { id: "item-1", productId: "product-1", itemName: "Product", quantity: 2, agreedUnitPrice: 30000 };
const inquiry = { id: "inquiry-1", inquiryNumber: "INQ-1", customerId: "customer-1", status: "Open", salesOrderId: null, items: [item] };
const createValues = { customerId: "customer-1", items: JSON.stringify([item]) };
const conversionValues = { customerId: "customer-1", inquiryId: inquiry.id, paymentTermType: "IMMEDIATE",
  items: JSON.stringify([{ ...item, baseUnitPrice: 30000, markupPercent: 0, discountPercent: 0 }]) };
const priceValues = { inquiryId: inquiry.id, expectedUpdatedAt: "2026-10-19T00:00:00.000Z", itemId: item.id, agreedUnitPrice: "35000" };
const statusValues = { inquiryId: inquiry.id, statusNote: "Customer request" };

describe("Inquiry mutation authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.role = "ADMIN";
    mocks.customer.mockResolvedValue({ id: "customer-1", companyName: "Customer", status: "Active" });
    mocks.products.mockResolvedValue([{ id: "product-1", productName: "Product", sku: "P1" }]);
    mocks.inquiry.mockResolvedValue(structuredClone(inquiry));
    mocks.create.mockResolvedValue(structuredClone(inquiry));
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.sequence.mockResolvedValue({ lastValue: 1 });
    mocks.lock.mockResolvedValue([{ id: "customer-1" }]);
    mocks.transaction.mockImplementation(async work => work(prisma));
  });

  it.each([
    ["create", createCustomerInquiry, createValues],
    ["price edit", updateCustomerInquiryPrices, priceValues],
    ["close", updateCustomerInquiryStatus, { ...statusValues, status: "Closed" }],
    ["cancel", updateCustomerInquiryStatus, { ...statusValues, status: "Cancelled" }],
    ["SO conversion", createSalesOrder, { ...conversionValues, source: "DIRECT" }],
    ["PO conversion", createSalesOrder, { ...conversionValues, source: "CUSTOMER_PO" }]
  ] as const)("denies Admin %s before querying or mutating data", async (_label, action, values) => {
    await expect(action(form(values))).rejects.toThrow(/REDIRECT:.*error=Only%20Sales%20and%20Manager/);
    for (const operation of [mocks.customer, mocks.products, mocks.inquiry, mocks.create, mocks.update,
      mocks.claim, mocks.price, mocks.sequence, mocks.transaction, mocks.audit, mocks.lock]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it.each(["SALES", "MANAGER"])("preserves %s creation and updates with portfolio scope", async role => {
    mocks.actor.role = role;
    await expect(createCustomerInquiry(form(createValues))).rejects.toThrow("success=");
    expect(mocks.create).toHaveBeenCalledOnce();
    await expect(updateCustomerInquiryPrices(form(priceValues))).rejects.toThrow("success=");
    expect(mocks.price).toHaveBeenCalledWith({ where: { id: item.id }, data: { agreedUnitPrice: 35000 } });
    for (const status of ["Closed", "Cancelled"]) {
      await expect(updateCustomerInquiryStatus(form({ ...statusValues, status }))).rejects.toThrow("success=");
      expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: inquiry.id }, data: { status, statusNote: statusValues.statusNote } });
    }
    expect(mocks.inquiry).toHaveBeenCalledWith(expect.objectContaining({
      where: role === "SALES"
        ? { id: inquiry.id, customer: { portfolioOwnerUserId: mocks.actor.id } }
        : { id: inquiry.id }
    }));
    expect(mocks.audit).toHaveBeenCalledTimes(4);
  });
});
