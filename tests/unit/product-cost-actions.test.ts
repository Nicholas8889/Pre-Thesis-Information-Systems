import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), redirect: vi.fn(), audit: vi.fn(),
  create: vi.fn(), update: vi.fn(), findUnique: vi.fn(),
  transaction: vi.fn(), queryRaw: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { createProduct, updateProduct } from "../../src/lib/actions";

const original = {
  id: "product-1", productName: "Product A", sku: null, notes: null,
  listPrice: 10_000, status: "Active"
};

describe("Admin production cost input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(path); });
    mocks.findUnique.mockResolvedValue(original);
    mocks.create.mockResolvedValue(original);
    mocks.update.mockResolvedValue({ ...original, listPrice: 12_000 });
    mocks.transaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: mocks.queryRaw,
        product: { create: mocks.create, update: mocks.update, findUnique: mocks.findUnique }
      })
    );
  });

  it("creates the initial cost and product together with Admin attribution", async () => {
    await expect(createProduct(form(10_000))).rejects.toThrow("success=");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        listPrice: 10_000,
        costHistory: { create: { unitCost: 10_000, createdByUserId: "admin-1" } }
      })
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });

  it("appends cost changes while holding the product lock", async () => {
    await expect(updateProduct(form(12_000))).rejects.toThrow("success=");
    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        listPrice: 12_000,
        costHistory: { create: {
          unitCost: 12_000, createdByUserId: "admin-1", effectiveFrom: expect.any(Date)
        } }
      })
    }));
  });

  it("does not append an entry for a metadata edit with unchanged cost", async () => {
    await expect(updateProduct(form(10_000))).rejects.toThrow("success=");
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("costHistory");
  });

  it.each(["SALES", "MANAGER"])("prevents %s from changing cost or creating priced products", async (role) => {
    mocks.user.mockResolvedValue({ id: "other-1", role });
    await expect(updateProduct(form(12_000))).rejects.toThrow("Only%20Admin");
    expect(mocks.update).not.toHaveBeenCalled();
    await expect(createProduct(form(10_000))).rejects.toThrow("Only%20Admin");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows Sales to edit product metadata without changing Admin's cost", async () => {
    mocks.user.mockResolvedValue({ id: "sales-1", role: "SALES" });
    await expect(updateProduct(form(10_000))).rejects.toThrow("success=");
    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("costHistory");
  });
});

function form(cost: number) {
  const data = new FormData();
  data.set("id", "product-1");
  data.set("productName", "Product A");
  data.set("listPrice", String(cost));
  data.set("status", "Active");
  return data;
}
