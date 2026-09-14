import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "../../src/lib/format";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { customer: { findMany: mocks.findMany, findUnique: mocks.findUnique } }
}));
vi.mock("@/lib/actions", () => ({
  createCustomer: vi.fn(), updateCustomer: vi.fn(), updateCustomerStatus: vi.fn()
}));

import CustomersPage from "../../src/app/customers/page";

const customer = {
  id: "customer-one", name: "Customer Contact", companyName: "Customer Company",
  phone: "081234", email: "", address: "Jakarta", customerSegment: "Wholesale",
  status: "Active", notes: null, npwp: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), salesOrders: []
};

describe("Customer Records payment display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows balances and invoice links in customer detail while preserving segment and account status", async () => {
    const record = { ...customer, invoices: [
      { id: "invoice-open", invoiceNumber: "INV-OPEN", dueDate: new Date("2099-12-31"),
        remainingAmount: 1_850_000, status: "Unpaid", deliveryNotes: [{ status: "Delivered" }], salesOrder: { deliveryNotes: [] } },
      { id: "invoice-cancelled", invoiceNumber: "INV-CANCELLED", dueDate: new Date("2026-01-01"),
        remainingAmount: 500_000, status: "Cancelled", deliveryNotes: [{ status: "Delivered" }], salesOrder: { deliveryNotes: [] } },
      { id: "invoice-pending", invoiceNumber: "INV-PENDING", dueDate: new Date("2099-12-31"),
        remainingAmount: 900_000, status: "Unpaid", deliveryNotes: [{ status: "Issued" }], salesOrder: { deliveryNotes: [] } }
    ] };
    mocks.findMany.mockResolvedValue([record]);
    mocks.findUnique.mockResolvedValue(record);

    const html = renderToStaticMarkup(await CustomersPage({
      searchParams: Promise.resolve({ view: customer.id })
    }));

    expect(html).toContain("Outstanding Payment");
    expect(html).toContain(formatCurrency(1_850_000));
    expect(html).toContain("1 open invoice(s)");
    expect(html).toContain('href="/invoices?view=invoice-open"');
    expect(html).not.toContain("INV-CANCELLED");
    expect(html).not.toContain("INV-PENDING");
    expect(html).toContain("Delivered Surat Jalan");
    expect(html).toContain("Wholesale");
    expect(html).toContain("Make Inactive");
    expect(html).not.toContain("Customer Category");
    expect(html).not.toContain("Payment Risk");
  });

  it("shows an inactive, settled customer as Clean without outstanding invoice links", async () => {
    const record = { ...customer, status: "Inactive", invoices: [
      { id: "invoice-settled", invoiceNumber: "INV-SETTLED", dueDate: new Date("2026-01-01"),
        remainingAmount: 0, status: "Paid", deliveryNotes: [{ status: "Delivered" }], salesOrder: { deliveryNotes: [] } }
    ] };
    mocks.findMany.mockResolvedValue([record]);
    mocks.findUnique.mockResolvedValue(record);

    const html = renderToStaticMarkup(await CustomersPage({
      searchParams: Promise.resolve({ view: customer.id })
    }));

    expect(html).toContain("Clean");
    expect(html).toContain(formatCurrency(0));
    expect(html).toContain("0 open invoice(s)");
    expect(html).toContain("Make Active");
    expect(html).not.toContain("Outstanding Invoices");
    expect(html).not.toContain("INV-SETTLED");
  });

  it("shows Clean for an unpaid invoice awaiting delivery and outstanding after delivery", async () => {
    const record = { ...customer, invoices: [{
      id: "invoice-awaiting", invoiceNumber: "INV-AWAITING", dueDate: new Date("2099-12-31"),
      remainingAmount: 1_850_000, status: "Unpaid", deliveryNotes: [{ status: "Issued" }], salesOrder: { deliveryNotes: [] }
    }] };
    mocks.findMany.mockResolvedValue([record]);
    mocks.findUnique.mockResolvedValue(record);

    const renderPage = async () => renderToStaticMarkup(await CustomersPage({
      searchParams: Promise.resolve({ view: customer.id })
    }));
    const beforeDelivery = await renderPage();
    expect(beforeDelivery).toContain(">Clean</span>");
    expect(beforeDelivery).toContain("Invoices awaiting delivery are not counted yet.");
    expect(beforeDelivery).not.toContain("Outstanding Invoices");

    record.invoices[0].deliveryNotes[0].status = "Delivered";
    const afterDelivery = await renderPage();
    expect(afterDelivery).toContain(">Outstanding Payment</span>");
    expect(afterDelivery).toContain(formatCurrency(1_850_000));
    expect(afterDelivery).toContain('href="/invoices?view=invoice-awaiting"');
  });
});
