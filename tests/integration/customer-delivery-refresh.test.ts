import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDeliveryNote: vi.fn(),
  updateDeliveryNote: vi.fn(),
  findDraft: vi.fn(),
  updateDraft: vi.fn(),
  updateDraftItems: vi.fn(),
  findSavedDraft: vi.fn(),
  lock: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  audit: vi.fn(),
  requireCurrentUser: vi.fn(),
  completeInquiry: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({
      $queryRaw: mocks.lock,
      $executeRaw: mocks.updateDraftItems,
      deliveryNote: {
        update: mocks.updateDeliveryNote,
        findUnique: mocks.findDraft,
        updateMany: mocks.updateDraft,
        findUniqueOrThrow: mocks.findSavedDraft
      }
    }),
    deliveryNote: { findUnique: mocks.findDeliveryNote }
  }
}));
vi.mock("@/lib/customer-inquiry-lifecycle", () => ({
  completeCustomerInquiriesForDeliveredOrders: mocks.completeInquiry
}));

import { saveDeliveryNoteDraft, updateDeliveryNoteStatus } from "../../src/lib/actions";

describe("customer balance refresh after a Surat Jalan change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "admin", username: "admin", displayName: "Admin", role: "ADMIN", status: "Active"
    });
    mocks.completeInquiry.mockResolvedValue([]);
    mocks.audit.mockResolvedValue(undefined);
    mocks.lock.mockResolvedValue([]);
    mocks.updateDraftItems.mockResolvedValue(1);
    mocks.redirect.mockImplementation((path: string) => { throw new Error("REDIRECT:" + path); });
  });

  it.each(["Delivered", "Cancelled"])("refreshes customer and order status after saving %s", async (status) => {
    const note = {
      id: "sj-one", deliveryNoteNumber: "SJ-ONE", salesOrderId: "so-one",
      status: "Issued", notes: null, issuedAt: new Date("2026-09-18T00:00:00.000Z"),
      receiverName: null, receivedAt: null, receivedBy: null, receiptNotes: null
    };
    mocks.findDeliveryNote.mockResolvedValue(note);
    mocks.updateDraft.mockResolvedValue({ count: 1 });
    mocks.findSavedDraft.mockResolvedValue({
      ...note,
      status,
      receiverName: status === "Delivered" ? "Ayu" : null,
      receivedAt: status === "Delivered" ? new Date("2026-09-18T03:00:00.000Z") : null,
      receivedBy: status === "Delivered" ? "Admin" : null,
      sources: []
    });

    const formData = new FormData();
    formData.set("id", note.id);
    formData.set("status", status);
    if (status === "Delivered") {
      formData.set("receiverName", "Ayu");
      formData.set("receivedAt", "2026-09-18T10:00");
    }
    await expect(updateDeliveryNoteStatus(formData)).rejects.toThrow(
      "REDIRECT:/surat-jalan?tab=completed&view=sj-one"
    );

    expect(mocks.updateDraft).toHaveBeenCalledWith({
      where: { id: note.id, status: note.status },
      data: expect.objectContaining({
        status,
        receiverName: status === "Delivered" ? "Ayu" : null
      })
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sales-orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customer-purchase-orders");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.updateDraft.mock.invocationCallOrder[0]
    );
    expect(mocks.completeInquiry).toHaveBeenCalledTimes(status === "Delivered" ? 1 : 0);
    if (status === "Delivered") {
      expect(mocks.completeInquiry).toHaveBeenCalledWith(expect.anything(), ["so-one"]);
    }
  });

  it("refreshes customer and order views after Issue & Lock", async () => {
    const updatedAt = new Date("2026-09-18T00:00:00.000Z");
    const item = {
      id: "line-one",
      orderedQuantitySnapshot: 5,
      packedQuantitySnapshot: 4,
      quantity: 4,
      outstandingQuantity: 1,
      adjustmentNote: null
    };
    const oldNote = {
      id: "sj-one",
      deliveryNoteNumber: "SJ-ONE",
      status: "Draft",
      updatedAt,
      recipientName: "Recipient",
      recipientAddress: "Address",
      items: [item],
      sources: []
    };
    const issued = {
      ...oldNote,
      status: "Issued",
      issuedAt: new Date(),
      issuedBy: "Admin",
      items: [{ ...item, quantity: 3, outstandingQuantity: 2 }]
    };
    mocks.findDraft.mockResolvedValue(oldNote);
    mocks.updateDraft.mockResolvedValue({ count: 1 });
    mocks.findSavedDraft.mockResolvedValue(issued);

    const data = new FormData();
    for (const [key, value] of Object.entries({
      id: oldNote.id,
      version: updatedAt.toISOString(),
      intent: "issue",
      recipientName: "Recipient",
      recipientAddress: "Address",
      deliveryDate: "2026-09-18",
      driverName: "Budi Santoso",
      vehiclePlateNumber: "B 1234 TJK",
      "quantity_line-one": "3"
    })) data.set(key, value);

    await expect(saveDeliveryNoteDraft(data)).rejects.toThrow(
      "REDIRECT:/surat-jalan?tab=open&view=sj-one"
    );
    expect(mocks.updateDraftItems).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sales-orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customer-purchase-orders");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.updateDraft.mock.invocationCallOrder[0]
    );
  });

  it("requires receipt evidence before marking a sent Surat Jalan as received", async () => {
    mocks.findDeliveryNote.mockResolvedValue({
      id: "sj-one",
      deliveryNoteNumber: "SJ-ONE",
      status: "Issued",
      notes: null,
      issuedAt: new Date("2026-09-18T00:00:00.000Z"),
      receiverName: null,
      receivedAt: null,
      receivedBy: null,
      receiptNotes: null
    });
    const data = new FormData();
    data.set("id", "sj-one");
    data.set("status", "Delivered");

    await expect(updateDeliveryNoteStatus(data)).rejects.toThrow(
      "Receiver%20name%20and%20a%20valid%20received%20date%2Ftime%20are%20required"
    );
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it.each(["Delivered", "Cancelled"])("does not reopen a terminal %s delivery", async (status) => {
    mocks.findDeliveryNote.mockResolvedValue({
      id: "sj-one", deliveryNoteNumber: "SJ-ONE", status, notes: null,
      issuedAt: new Date("2026-09-18T00:00:00.000Z"), receiverName: null,
      receivedAt: null, receivedBy: null, receiptNotes: null
    });
    const data = new FormData();
    data.set("id", "sj-one");
    data.set("status", "Delivered");
    data.set("receiverName", "Ayu");
    data.set("receivedAt", "2026-09-18T10:00");
    await expect(updateDeliveryNoteStatus(data)).rejects.toThrow(
      "Invalid%20Surat%20Jalan%20status%20transition"
    );
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });
});
