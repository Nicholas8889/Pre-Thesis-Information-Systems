import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), transaction: vi.fn(), preview: vi.fn(), apply: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/order-item-edit-service", () => ({ previewOrderItemEdit: mocks.preview, applyOrderItemEdit: mocks.apply }));
import { previewSalesOrderItemChanges, saveSalesOrderItemChanges } from "../../src/lib/order-item-edit-actions";
import { OrderItemEditError } from "../../src/lib/order-item-edit-context";

const actor = { id: "session-manager", role: "MANAGER", username: "manager", displayName: "Manager" };
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id: "order", version: "1", items: JSON.stringify([{ itemId: "row", productId: "product", quantity: 3 }]), quoteHash: "a".repeat(64), confirmationNote: "Correction" })) data.set(key, value);
  return data;
}
describe("authenticated item edit server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.mockResolvedValue(actor);
    mocks.transaction.mockImplementation(async operation => operation({ tx: true }));
    mocks.preview.mockResolvedValue({ quoteHash: "a".repeat(64), total: 100 });
    mocks.apply.mockResolvedValue({ id: "order", source: "CUSTOMER_PO", revisionNumber: 2, version: 2, invoiceId: "invoice", pickingListId: "sheet" });
  });
  it("uses the authenticated actor for read-only previews", async () => {
    const request = { id: "order", expectedVersion: 1, items: [{ productId: "p", quantity: 1 }] };
    expect(await previewSalesOrderItemChanges(request)).toMatchObject({ ok: true });
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), request, actor);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("saves through one transaction and refreshes canonical SO/PO, invoice and sheet paths", async () => {
    const result = await saveSalesOrderItemChanges(form());
    expect(result).toMatchObject({ ok: true, href: "/customer-purchase-orders/order" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "order", expectedVersion: 1, reason: "Correction", quoteHash: "a".repeat(64) }), actor);
    for (const path of ["/", "/invoices", "/pick-pack", "/receivables", "/collections", "/customer-purchase-orders/order", "/invoices/invoice/print", "/pick-pack/sheet/print"]) expect(mocks.refresh).toHaveBeenCalledWith(path);
  });
  it.each(["customerId", "source", "total", "actorUserId", "revisionNumber", "paidAmount"])("rejects forged top-level %s", async key => {
    const data = form(); data.set(key, "forged");
    expect(await saveSalesOrderItemChanges(data)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects duplicated inputs, malformed JSON and missing preview/reason fields", async () => {
    for (const kind of ["duplicate", "json", "preview", "reason"]) {
      const data = form();
      if (kind === "duplicate") data.append("id", "foreign");
      if (kind === "json") data.set("items", "bad JSON");
      if (kind === "preview") data.delete("quoteHash");
      if (kind === "reason") data.delete("confirmationNote");
      expect(await saveSalesOrderItemChanges(data)).toMatchObject({ ok: false, code: "INVALID_PAYLOAD" });
    }
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("returns actionable conflicts without invalidating caches", async () => {
    mocks.apply.mockRejectedValue(new OrderItemEditError("PACK_STARTED", "Pack already started"));
    expect(await saveSalesOrderItemChanges(form())).toEqual({ ok: false, code: "PACK_STARTED", message: "Pack already started" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("authenticates before any transaction and propagates unexpected transaction failures", async () => {
    mocks.user.mockRejectedValueOnce(new Error("Login required"));
    await expect(saveSalesOrderItemChanges(form())).rejects.toThrow("Login required");
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.transaction.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(saveSalesOrderItemChanges(form())).rejects.toThrow("Database unavailable");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
