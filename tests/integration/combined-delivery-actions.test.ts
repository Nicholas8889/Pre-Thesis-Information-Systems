
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
    items: [{ id: "pick-item-" + id, salesOrderItemId: "item-" + id, itemName: "Same product", orderedQuantity: 5, availableQuantity: 5, packedQuantity: 5, availabilityStatus: "Available", notes: null as string | null }],
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
function form(ids = ["a", "b"], selectedItemIds = ids.map(id => "pick-item-" + id)) {
  const data = new FormData();
  data.set("itemSelectionMode", "explicit");
  ids.forEach(id => data.append("pickingListId", id));
  selectedItemIds.forEach(id => {
    data.append("selectedItemId", id);
    data.set("quantity_" + id, "5");
  });
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
      customerId: "customer", recipientAddress: "One destination", status: "Draft",
      salesOrderId: null, invoiceId: null, pickingListId: null,
      sources: { create: [
        { pickingListId: "a", salesOrderId: "SO-a", invoiceId: "INV-a" },
        { pickingListId: "b", salesOrderId: "SO-b", invoiceId: "INV-b" }
      ] }
    });
    expect(mocks.items.mock.calls[0][0].data).toEqual([
      { deliveryNoteId: "sj", sourceId: "source-0", pickingListItemId: "pick-item-a", itemName: "Same product", orderedQuantitySnapshot: 5, packedQuantitySnapshot: 5, quantity: 5, outstandingQuantity: 0, unit: "PCS" },
      { deliveryNoteId: "sj", sourceId: "source-1", pickingListItemId: "pick-item-b", itemName: "Same product", orderedQuantitySnapshot: 5, packedQuantitySnapshot: 5, quantity: 5, outstandingQuantity: 0, unit: "PCS" }
    ]);
    expect(mocks.writes).toEqual(["begin", "commit"]);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.lists.mock.invocationCallOrder[0]);
  });
  it("uses selected final quantities and keeps unselected packed lines as outstanding", async () => {
    const second = packed("b");
    second.items.push({
      id: "pick-item-b-extra",
      salesOrderItemId: "item-b-extra",
      itemName: "Extra packed product",
      orderedQuantity: 3,
      availableQuantity: 3,
      packedQuantity: 3,
      availabilityStatus: "Available",
      notes: null,
    });
    second.salesOrder.items.push({ id: "item-b-extra", itemName: "Extra packed product", quantity: 3 });
    mocks.lists.mockResolvedValue([packed("a"), second]);
    const data = form();
    data.set("quantity_pick-item-a", "3");

    await expect(createDeliveryNote(data)).rejects.toThrow("tab=open&view=sj");
    expect(mocks.items.mock.calls[0][0].data.map((item: {
      pickingListItemId: string;
      quantity: number;
      outstandingQuantity: number;
    }) => [item.pickingListItemId, item.quantity, item.outstandingQuantity])).toEqual([
      ["pick-item-a", 3, 2],
      ["pick-item-b", 5, 0],
      ["pick-item-b-extra", 0, 3],
    ]);
  });

  it("rejects item IDs outside the selected Packed Lists", async () => {
    const data = form();
    data.append("selectedItemId", "tampered-item");
    data.set("quantity_tampered-item", "1");
    await expect(createDeliveryNote(data)).rejects.toThrow("Selected%20items%20must%20be%20packed");
    expect(mocks.create).not.toHaveBeenCalled();
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
  it("keeps partial and packed-zero lines as documented outstanding", async () => {
    const second = packed("b");
    second.items[0].availableQuantity = 4;
    second.items[0].packedQuantity = 4;
    second.items[0].availabilityStatus = "Partial";
    second.items[0].notes = "One unit unavailable";
    second.items.push({
      id: "pick-item-b-zero",
      salesOrderItemId: "item-b-zero",
      itemName: "Unavailable product",
      orderedQuantity: 3,
      availableQuantity: 0,
      packedQuantity: 0,
      availabilityStatus: "Unavailable",
      notes: "Entire item unavailable",
    });
    second.salesOrder.items.push({ id: "item-b-zero", itemName: "Unavailable product", quantity: 3 });
    mocks.lists.mockResolvedValue([packed("a"), second]);
    const data = form();
    data.set("quantity_pick-item-b", "4");
    await expect(createDeliveryNote(data)).rejects.toThrow("tab=open&view=sj");
    expect(mocks.items.mock.calls[0][0].data.map((item: { quantity: number; outstandingQuantity: number }) => [item.quantity, item.outstandingQuantity])).toEqual([[5, 0], [4, 1], [0, 3]]);
  });
  it.each(["pending", "changed", "existing", "cancelled-invoice", "approval"])("rejects an ineligible member: %s", async reason => {
    const second = packed("b");
    if (reason === "pending") second.status = "InProgress";
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
