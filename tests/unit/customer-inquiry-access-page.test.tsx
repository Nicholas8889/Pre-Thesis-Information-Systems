import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { id: "sales-1", role: "ADMIN" },
  customers: vi.fn(), products: vi.fn(), inquiries: vi.fn(), inquiry: vi.fn()
}));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => mocks.actor }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  customer: { findMany: mocks.customers }, product: { findMany: mocks.products },
  customerInquiry: { findMany: mocks.inquiries, findFirst: mocks.inquiry }
} }));
vi.mock("@/lib/actions", () => ({ createCustomerInquiry: vi.fn(), updateCustomerInquiryPrices: vi.fn(), updateCustomerInquiryStatus: vi.fn() }));

import CustomerInquiriesPage from "../../src/app/customer-inquiries/page";
import CustomerInquiryDetailPage from "../../src/app/customer-inquiries/[inquiryId]/page";

const customer = { id: "customer-1", companyName: "Customer", name: "Contact" };
const inquiry = {
  id: "inquiry-1", inquiryNumber: "INQ-1", customer,
  inquiryDate: new Date("2026-10-19"), updatedAt: new Date("2026-10-19"),
  status: "Open", salesOrderId: null, salesOrder: null,
  items: [{ id: "item-1", itemName: "Product", quantity: 2, requestedUnitPrice: null,
    agreedUnitPrice: 30000, productId: "product-1", product: { status: "Active" } }]
};
const detailProps = { params: Promise.resolve({ inquiryId: inquiry.id }) };

describe("Inquiry page role restrictions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    mocks.actor.role = "ADMIN";
    mocks.customers.mockResolvedValue([customer]);
    mocks.products.mockResolvedValue([]);
    mocks.inquiries.mockResolvedValue([inquiry]);
    mocks.inquiry.mockResolvedValue(inquiry);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lets Admin read records but hides Add Inquiry and blocks a direct create URL", async () => {
    for (const params of [{}, { mode: "create" }]) {
      const html = renderToStaticMarkup(await CustomerInquiriesPage({ searchParams: Promise.resolve(params) }));
      expect(html).toContain("INQ-1");
      expect(html).not.toContain("Add Inquiry");
      expect(html).not.toContain("Create Customer Inquiry");
      if (params.mode) expect(html).toContain("Only Sales and Manager");
    }
    expect(mocks.customers).not.toHaveBeenCalled();
    expect(mocks.products).not.toHaveBeenCalled();
  });

  it("shows Admin inquiry details without mutation or conversion controls", async () => {
    const html = renderToStaticMarkup(await CustomerInquiryDetailPage(detailProps));
    expect(html).toContain("INQ-1");
    expect(html).toContain("Product");
    for (const label of ["Update Agreed Prices", "Save Agreed Prices", "Close Inquiry", "Cancel Inquiry",
      "Convert to Sales Order", "Convert to Customer PO", "To convert, link every item"]) {
      expect(html).not.toContain(label);
    }
  });

  it.each(["SALES", "MANAGER"])("preserves %s creation, editing, closing, cancelling and conversion controls", async role => {
    mocks.actor.role = role;
    const list = renderToStaticMarkup(await CustomerInquiriesPage({ searchParams: Promise.resolve({ mode: "create" }) }));
    expect(list).toContain("Add Inquiry");
    expect(list).toContain("Create Customer Inquiry");
    const detail = renderToStaticMarkup(await CustomerInquiryDetailPage(detailProps));
    for (const label of ["Update Agreed Prices", "Save Agreed Prices", "Close Inquiry", "Cancel Inquiry",
      "Convert to Sales Order", "Convert to Customer PO"]) {
      expect(detail).toContain(label);
    }
    expect(mocks.inquiry).toHaveBeenCalledWith(expect.objectContaining({
      where: role === "SALES"
        ? { id: inquiry.id, customer: { portfolioOwnerUserId: mocks.actor.id } }
        : { id: inquiry.id }
    }));
  });
});
