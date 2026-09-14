
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerPaymentSummary } from "../../src/lib/customer-intelligence";
import { linkedDeliveryNotes } from "../../src/lib/delivery-note-links";

const mocks = vi.hoisted(() => ({
  lists: vi.fn(), create: vi.fn(), items: vi.fn(), lock: vi.fn(), update: vi.fn(),
  find: vi.fn(), inquiry: vi.fn(), role: "ADMIN", writes: [] as string[]
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => ({ id: "user", role: mocks.role }) }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: vi.fn() }));
vi.mock("@/lib/customer-inquiry-lifecycle", () => ({ completeCustomerInquiryForDeliveredOrder: mocks.inquiry }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryNote: { findMany: async () => [], findUnique: mocks.find },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      mocks.writes.push("begin");
      try {
        const result = await work({
          $queryRaw: mocks.lock,
          pickingList: { findMany: mocks.lists },
          deliveryNote: { create: mocks.create, update: mocks.update },
          deliveryNoteItem: { createMany: mocks.items }
        });
        mocks.writes.push("commit");
        return result;
      } catch (error) { mocks.writes.push("rollback"); throw error; }
    }
  }
}));
import { createDeliveryNote, updateDeliveryNoteStatus } from "../../src/lib/actions";

function packed(id: string, customerId = "customer") {
  return {
    id, status: "Packed", pickingListNumber: "PL-" + id,
    pickerName: "Picker", packerName: "Packer", packageCount: 1,
    deliveryNote: null as null | { id: string },
    deliverySource: null as null | { id: string },
    salesOrderId: "SO-" + id,
    items: [{ salesOrderItemId: "item-" + id, itemName: "Same product", orderedQuantity: 5, pickedQuantity: 5, packedQuantity: 5 }],
    salesOrder: {
      id: "SO-" + id, customerId, orderNumber: "SO-" + id, customerPoNumber: id === "b" ? "PO-b" : null,
      source: id === "b" ? "CUSTOMER_PO" : "DIRECT", status: "Invoiced", approvalStatus: "Approved",
      customer: { id: customerId },
      items: [{ id: "item-" + id, itemName: "Same product", quantity: 5 }],
      deliveryNotes: [], deliverySources: [],
      invoice: { id: "INV-" + id, status: "Unpaid", paymentTermType: "IMMEDIATE", deliveryNotes: [], deliverySources: [] }
    }
  };
}
function form(ids = ["a", "b"]) {
  const data = new FormData();
  ids.forEach(id => data.append("pickingListId", id));
  for (const [key, value] of Object.entries({
    recipientName: "Recipient", recipientAddress: "One destination", deliveryDate: "2026-09-13",
    driverName: "Budi Santoso", vehiclePlateNumber: "B 1234 TJK"
  })) data.set(key, value);
  return data;
}

describe("combined delivery server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.role = "ADMIN"; mocks.writes.length = 0;
    mocks.lists.mockResolvedValue([packed("a"), packed("b")]);
    mocks.lock.mockResolvedValue([]);
    mocks.items.mockResolvedValue({ count: 2 });
    mocks.create.mockImplementation(async ({ data }) => ({
      ...data, id: "sj", sources: data.sources.create.map((source: object, index: number) => ({ ...source, id: "source-" + index }))
    }));
    mocks.inquiry.mockResolvedValue(null);
  });
  it("creates one SJ for mixed SO/PO, preserving per-order lines and invoice links", async () => {
    const data = form();
    data.set("items", JSON.stringify([{ quantity: 999 }]));
    await expect(createDeliveryNote(data)).rejects.toThrow("tab=open&view=sj");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      customerId: "customer", recipientAddress: "One destination",
      salesOrderId: null, invoiceId: null, pickingListId: null,
      sources: { create: [
        { pickingListId: "a", salesOrderId: "SO-a", invoiceId: "INV-a" },
        { pickingListId: "b", salesOrderId: "SO-b", invoiceId: "INV-b" }
      ] }
    });
    expect(mocks.items.mock.calls[0][0].data).toEqual([
      { deliveryNoteId: "sj", sourceId: "source-0", itemName: "Same product", quantity: 5, unit: "PCS" },
      { deliveryNoteId: "sj", sourceId: "source-1", itemName: "Same product", quantity: 5, unit: "PCS" }
    ]);
    expect(mocks.writes).toEqual(["begin", "commit"]);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.lists.mock.invocationCallOrder[0]);
  });
  it("retains single-order header links", async () => {
    mocks.lists.mockResolvedValue([packed("a")]);
    await expect(createDeliveryNote(form(["a"]))).rejects.toThrow("tab=open&view=sj");
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ pickingListId: "a", salesOrderId: "SO-a", invoiceId: "INV-a" });
  });
  it("rejects mixed customers before creating any document", async () => {
    mocks.lists.mockResolvedValue([packed("a"), packed("b", "other")]);
    await expect(createDeliveryNote(form())).rejects.toThrow("same%20customer");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual(["begin", "rollback"]);
  });
  it.each(["pending", "shortage", "changed", "existing", "cancelled-invoice", "approval"])("rejects an ineligible member: %s", async reason => {
    const second = packed("b");
    if (reason === "pending") second.status = "InProgress";
    if (reason === "shortage") second.items[0].packedQuantity = 4;
    if (reason === "changed") second.salesOrder.items[0].quantity = 6;
    if (reason === "existing") second.deliverySource = { id: "other-sj-source" };
    if (reason === "cancelled-invoice") second.salesOrder.invoice.status = "Cancelled";
    if (reason === "approval") second.salesOrder.approvalStatus = "Pending";
    mocks.lists.mockResolvedValue([packed("a"), second]);
    await expect(createDeliveryNote(form())).rejects.toThrow("Picking%20List%20is%20not%20ready");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([[], ["a", "a"], ["a", "missing"]].map(ids => ({ ids })))("rejects invalid selection $ids", async ({ ids }) => {
    if (ids.includes("missing")) mocks.lists.mockResolvedValue([packed("a")]);
    await expect(createDeliveryNote(form(ids))).rejects.toThrow("error=");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires a shared destination", async () => {
    const data = form(); data.set("recipientAddress", " ");
    await expect(createDeliveryNote(data)).rejects.toThrow("address");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("denies Sales users", async () => {
    mocks.role = "SALES";
    await expect(createDeliveryNote(form())).rejects.toThrow("Only%20Admin");
    expect(mocks.lock).not.toHaveBeenCalled();
  });
  it("rolls back the document if its line creation fails", async () => {
    mocks.items.mockRejectedValueOnce(new Error("item write failed"));
    await expect(createDeliveryNote(form())).rejects.toThrow("item write failed");
    expect(mocks.writes).toEqual(["begin", "rollback"]);
  });
  it("completes every linked inquiry in the Delivered transaction", async () => {
    mocks.find.mockResolvedValue({ id: "sj", status: "Issued", notes: null });
    mocks.update.mockResolvedValue({ id: "sj", deliveryNoteNumber: "SJ", status: "Delivered", salesOrderId: null, sources: [{ salesOrderId: "SO-a" }, { salesOrderId: "SO-b" }] });
    const data = new FormData(); data.set("id", "sj"); data.set("status", "Delivered");
    await expect(updateDeliveryNoteStatus(data)).rejects.toThrow("tab=completed");
    expect(mocks.inquiry.mock.calls.map(call => call[1])).toEqual(["SO-a", "SO-b"]);
    expect(mocks.writes).toEqual(["begin", "commit"]);
  });
  it("rolls back Delivered if an inquiry update fails", async () => {
    mocks.find.mockResolvedValue({ id: "sj", status: "Issued", notes: null });
    mocks.update.mockResolvedValue({ id: "sj", status: "Delivered", salesOrderId: null, sources: [{ salesOrderId: "SO-a" }] });
    mocks.inquiry.mockRejectedValueOnce(new Error("inquiry failed"));
    const data = new FormData(); data.set("id", "sj"); data.set("status", "Delivered");
    await expect(updateDeliveryNoteStatus(data)).rejects.toThrow("inquiry failed");
    expect(mocks.writes).toEqual(["begin", "rollback"]);
  });
});

describe("combined delivery projections", () => {
  it.each(["Issued", "Delivered", "Cancelled"])("counts each invoice once only for Delivered (%s)", status => {
    const invoices = [600, 1000, 0].map(remainingAmount => ({
      status: remainingAmount ? "Partial" : "Paid", remainingAmount,
      deliveryNotes: [{ status }],
      deliverySources: [{ deliveryNote: { status } }],
      salesOrder: { deliveryNotes: [] }
    }));
    expect(getCustomerPaymentSummary({ invoices })).toEqual({
      paymentStatus: status === "Delivered" ? "Outstanding Payment" : "Clean",
      outstandingAmount: status === "Delivered" ? 1600 : 0,
      openInvoiceCount: status === "Delivered" ? 2 : 0
    });
  });
  it("deduplicates legacy and source links while keeping shared notes visible", () => {
    const note = { id: "sj", status: "Delivered" };
    expect(linkedDeliveryNotes({ deliveryNotes: [note], deliverySources: [{ deliveryNote: note }] })).toEqual([note]);
    expect(linkedDeliveryNotes({ deliveryNotes: [], deliverySources: [{ deliveryNote: note }] })).toEqual([note]);
  });
});
