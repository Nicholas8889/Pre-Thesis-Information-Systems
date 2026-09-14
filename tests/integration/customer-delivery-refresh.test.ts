import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDeliveryNote: vi.fn(), updateDeliveryNote: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(), audit: vi.fn(),
  requireCurrentUser: vi.fn(), completeInquiry: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ deliveryNote: { update: mocks.updateDeliveryNote } }), deliveryNote: { findUnique: mocks.findDeliveryNote, update: mocks.updateDeliveryNote } }
}));
vi.mock("@/lib/customer-inquiry-lifecycle", () => ({
  completeCustomerInquiryForDeliveredOrder: mocks.completeInquiry
}));

import { updateDeliveryNoteStatus } from "../../src/lib/actions";

describe("customer balance refresh after a Surat Jalan change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN", status: "Active" });
    mocks.completeInquiry.mockResolvedValue(null);
    mocks.redirect.mockImplementation((path: string) => { throw new Error("REDIRECT:" + path); });
  });

  it.each(["Delivered", "Issued", "Cancelled"])("refreshes customer and order status after saving %s", async (status) => {
    const note = { id: "sj-one", deliveryNoteNumber: "SJ-ONE", salesOrderId: "so-one",
      status: status === "Issued" ? "Draft" : "Issued", notes: null };
    mocks.findDeliveryNote.mockResolvedValue(note);
    mocks.updateDeliveryNote.mockResolvedValue({ ...note, status });

    const formData = new FormData();
    formData.set("id", note.id);
    formData.set("status", status);
    await expect(updateDeliveryNoteStatus(formData)).rejects.toThrow(`REDIRECT:/surat-jalan?tab=${status === "Issued" ? "open" : "completed"}&view=sj-one`);

    expect(mocks.updateDeliveryNote).toHaveBeenCalledWith({
      where: { id: note.id, status: note.status }, data: { status, notes: null }, include: { sources: { select: { salesOrderId: true } } }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customers");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/sales-orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/customer-purchase-orders");
    expect(mocks.revalidatePath.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.updateDeliveryNote.mock.invocationCallOrder[0]);
    expect(mocks.completeInquiry).toHaveBeenCalledTimes(status === "Delivered" ? 1 : 0);
  });
  it.each(["Delivered", "Cancelled"])("does not reopen a terminal %s delivery", async (status) => {
    mocks.findDeliveryNote.mockResolvedValue({ id: "sj-one", deliveryNoteNumber: "SJ-ONE", status, notes: null });
    const data = new FormData();
    data.set("id", "sj-one");
    data.set("status", "Issued");
    await expect(updateDeliveryNoteStatus(data)).rejects.toThrow("Invalid%20Surat%20Jalan%20status%20transition");
    expect(mocks.updateDeliveryNote).not.toHaveBeenCalled();
  });

});
