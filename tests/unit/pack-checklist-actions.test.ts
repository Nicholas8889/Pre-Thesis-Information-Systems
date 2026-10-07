import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), list: vi.fn(), update: vi.fn(), itemUpdate: vi.fn(),
  itemUpdateMany: vi.fn(), audit: vi.fn(), transaction: vi.fn(), lock: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  pickingList: { findUnique: mocks.list }, $transaction: mocks.transaction,
} }));
import { reopenPickingList, savePickingList } from "../../src/lib/picking-list-actions";

const list = {
  id: "sheet", salesOrderId: "order", pickingListNumber: "PL-1", status: "InProgress", usesChecklist: true,
  pickerName: "Dewi", packerName: null, packageCount: null,
  updatedAt: new Date("2026-10-04T10:00:00Z"), notes: null,
  deliveryNote: null, deliverySource: null,
  items: [{ id: "a", orderedQuantity: 10, availableQuantity: 0, packedQuantity: 0, availabilityStatus: "Unchecked", isChecked: false, notes: null }],
};
function form(intent = "complete", checked = true) {
  const data = new FormData();
  Object.entries({ id: list.id, version: list.updatedAt.toISOString(), intent, pickerName: "Dewi" }).forEach(([key, value]) => data.set(key, value));
  data.append("itemId", "a");
  if (checked) data.append("checkedItemId", "a");
  return data;
}
describe("checklist server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.list.mockResolvedValue(list);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async work => work({
      $queryRaw: mocks.lock,
      pickingList: { updateMany: mocks.update },
      pickingListItem: { update: mocks.itemUpdate, updateMany: mocks.itemUpdateMany },
    }));
  });
  it("completes without quantities, second PIC, package count or shortage notes", async () => {
    await expect(savePickingList(form())).rejects.toThrow("success=Pick%20%26%20Pack%20completed");
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "Packed", pickerName: "Dewi", packerName: "Dewi", usesChecklist: true, packageCount: null });
    expect(mocks.itemUpdate.mock.calls[0][0].data).toEqual({ isChecked: true, availableQuantity: 10, packedQuantity: 10, availabilityStatus: "Available" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "PACKED" }), expect.anything());
  });
  it("saves incomplete checks without completing or changing quantity snapshots", async () => {
    await expect(savePickingList(form("save", false))).rejects.toThrow("progress%20saved");
    expect(mocks.itemUpdate.mock.calls[0][0].data).toEqual({ isChecked: false });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "InProgress", packedAt: null });
  });
  it("moves Pick to Pack with no checks or quantity input", async () => {
    mocks.list.mockResolvedValue({ ...list, status: "Pending" });
    await expect(savePickingList(form("continue", false))).rejects.toThrow("Ready%20for%20Pack%20checks");
    expect(mocks.update.mock.calls[0][0].where.status).toBe("Pending");
  });
  it("lets a migrated sheet without a recorded PIC reach Pack for PIC assignment", async () => {
    mocks.list.mockResolvedValue({ ...list, status: "Pending", pickerName: null });
    const data = form("continue", false); data.delete("pickerName");
    await expect(savePickingList(data)).rejects.toThrow("Ready%20for%20Pack%20checks");
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "InProgress", pickerName: null });
  });
  it.each(["unchecked", "blank-pic", "stale", "skip-pick", "linked", "complete-again", "tampered"])("rejects %s before writing", async kind => {
    const data = form();
    if (kind === "unchecked") data.delete("checkedItemId");
    if (kind === "blank-pic") data.set("pickerName", " ");
    if (kind === "stale") data.set("version", "old");
    if (kind === "skip-pick") mocks.list.mockResolvedValue({ ...list, status: "Pending" });
    if (kind === "linked") mocks.list.mockResolvedValue({ ...list, deliverySource: { id: "source" } });
    if (kind === "complete-again") mocks.list.mockResolvedValue({ ...list, status: "Packed" });
    if (kind === "tampered") data.set("packed_a", "5");
    await expect(savePickingList(data)).rejects.toThrow("error=");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects a concurrent change without updating items or audit", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    await expect(savePickingList(form())).rejects.toThrow("This+Picking+List+changed");
    expect(mocks.itemUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("resets checks on reopen and requires a fresh review", async () => {
    mocks.list.mockResolvedValue({ ...list, status: "Packed" });
    const data = form(); data.set("confirmationNote", "Review again");
    await expect(reopenPickingList(data)).rejects.toThrow("success=Picking%20List%20reopened");
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith({ where: { pickingListId: "sheet" }, data: { isChecked: false } });
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ status: "InProgress", packedAt: null });
  });
  it("requires a reason and blocks reopening any sheet linked to a Draft", async () => {
    mocks.list.mockResolvedValue({ ...list, status: "Packed", deliverySource: { id: "source" } });
    await expect(reopenPickingList(form())).rejects.toThrow("A+reason+is+required");
    const data = form(); data.set("confirmationNote", "Review again");
    await expect(reopenPickingList(data)).rejects.toThrow("cannot+be+reopened");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("keeps Sales read-only", async () => {
    mocks.user.mockResolvedValue({ role: "SALES" });
    await expect(savePickingList(form())).rejects.toThrow("Only+Admin+and+Manager");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
