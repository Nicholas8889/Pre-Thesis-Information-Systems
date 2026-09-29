import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(), createOrder: vi.fn(), findCustomer: vi.fn(),
  findProducts: vi.fn(), createInvoice: vi.fn(), sequence: vi.fn(),
  transaction: vi.fn(), audit: vi.fn(), upload: vi.fn(), removeUpload: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }
}));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: async () => ({ id: "manager-1", role: "MANAGER" })
}));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/customer-po-storage", () => ({
  validateCustomerPoDocument: async () => ({ originalName: "po.pdf" }),
  uploadCustomerPoDocument: mocks.upload,
  deleteCustomerPoDocument: mocks.removeUpload
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOrder: { findUnique: mocks.findOrder, create: mocks.createOrder },
    customer: { findFirst: mocks.findCustomer },
    product: { findMany: mocks.findProducts },
    invoice: { create: mocks.createInvoice },
    documentSequence: { upsert: mocks.sequence },
    $transaction: mocks.transaction
  }
}));

import { createSalesOrder } from "../../src/lib/actions";
import { prisma } from "../../src/lib/prisma";
import { getJakartaDocumentYear } from "../../src/lib/document-numbering";

function form(number?: string, source = "CUSTOMER_PO") {
  const data = new FormData();
  data.set("source", source);
  data.set("customerId", "customer-1");
  data.set("idempotencyKey", "submission-1");
  data.set("paymentTermType", "IMMEDIATE");
  data.set("requiredDate", "2026-12-31");
  data.set("items", JSON.stringify([{
    productId: "product-1", quantity: 2, baseUnitPrice: 100_000,
    markupPercent: 0, discountPercent: 0
  }]));
  if (number !== undefined) data.set("customerPoNumber", number);
  return data;
}

describe("optional customer-entered PO numbers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findOrder.mockResolvedValue(null);
    mocks.findCustomer.mockResolvedValue({
      id: "customer-1", name: "Contact", companyName: "Customer",
      address: "Jakarta", phone: "", email: "", npwp: null, invoices: []
    });
    mocks.findProducts.mockResolvedValue([{
      id: "product-1", productName: "Product", sku: "P1", listPrice: 100_000
    }]);
    mocks.createOrder.mockImplementation(async ({ data }) => ({ id: "order-1", ...data }));
    mocks.createInvoice.mockImplementation(async ({ data }) => ({ id: "invoice-1", ...data }));
    mocks.sequence.mockResolvedValue({ lastValue: 1 });
    mocks.transaction.mockImplementation(async work => work(prisma));
    mocks.upload.mockResolvedValue({ originalName: "po.pdf", storedName: "test/po.pdf" });
    mocks.removeUpload.mockResolvedValue(undefined);
  });

  it("preserves a trimmed customer reference, including leading zeros, in the PO and invoice", async () => {
    await expect(createSalesOrder(form("  001/ACME/IX-2026  "))).rejects.toThrow("success=");
    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerPoNumber: "001/ACME/IX-2026" })
    }));
    expect(mocks.createInvoice).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerPoNumberSnapshot: "001/ACME/IX-2026" })
    }));
    expect(mocks.sequence.mock.calls.map(([arg]) => arg.create.documentType)).toEqual(["SO", "INV"]);
  });

  it.each([undefined, "", "   "])("generates a PO number for blank input %s", async number => {
    await expect(createSalesOrder(form(number))).rejects.toThrow("success=");
    expect(mocks.createOrder.mock.calls[0][0].data.customerPoNumber).toBe(`PO-${getJakartaDocumentYear()}-001`);
  });

  it("skips an automatic number already used by a manual reference", async () => {
    const first = `PO-${getJakartaDocumentYear()}-001`;
    mocks.findOrder.mockImplementation(async ({ where }) => where.customerPoNumber === first ? { id: "existing" } : null);
    let poSequence = 0;
    mocks.sequence.mockImplementation(async ({ create }) => ({ lastValue: create.documentType === "PO" ? ++poSequence : 1 }));
    await expect(createSalesOrder(form())).rejects.toThrow("success=");
    expect(mocks.createOrder.mock.calls[0][0].data.customerPoNumber).toBe(`PO-${getJakartaDocumentYear()}-002`);
  });

  it("rejects duplicate references before uploading or creating records", async () => {
    mocks.findOrder.mockImplementation(async ({ where }) => where.customerPoNumber ? { id: "existing" } : null);
    await expect(createSalesOrder(form("DUPLICATE"))).rejects.toThrow("Customer%20PO%20Number%20is%20already%20used");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("handles a concurrent duplicate and cleans up the uploaded document", async () => {
    mocks.createOrder.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002", clientVersion: "6", meta: { target: ["customer_po_number"] }
    }));
    await expect(createSalesOrder(form("RACE"))).rejects.toThrow("Customer%20PO%20Number%20is%20already%20used");
    expect(mocks.removeUpload).toHaveBeenCalledWith("test/po.pdf");
    expect(mocks.createInvoice).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(["A".repeat(121), "PO\n123", "PO\u0000123"])("rejects invalid references before writing", async number => {
    await expect(createSalesOrder(form(number))).rejects.toThrow("single%20line%20of%20120%20characters");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps direct Sales Orders without a customer PO reference", async () => {
    await expect(createSalesOrder(form("IGNORED", "DIRECT"))).rejects.toThrow("success=");
    expect(mocks.createOrder.mock.calls[0][0].data.customerPoNumber).toBeNull();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("treats a repeated submission as the existing PO even when its number is already in use", async () => {
    mocks.findOrder.mockResolvedValue({ id: "order-1", source: "CUSTOMER_PO", createdByUserId: "manager-1" });
    await expect(createSalesOrder(form("EXISTING"))).rejects.toThrow("already%20created");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});
