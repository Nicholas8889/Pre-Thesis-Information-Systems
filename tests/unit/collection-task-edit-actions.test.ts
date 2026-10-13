import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), claim: vi.fn(), updated: vi.fn(), transaction: vi.fn(), audit: vi.fn()
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => ({ id: "sales-a", role: "SALES", displayName: "Sales A" }) }));
vi.mock("@/lib/audit", () => ({ createAuditTrailLog: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { updateCollectionTask } from "../../src/lib/actions";

const task = {
  id: "task-one", customerId: "customer-one", invoiceId: null,
  status: "Planned", version: 2, scheduledDate: new Date("2026-10-15T00:00:00Z"),
  notes: "Call customer", customer: { companyName: "Customer Company" }, invoice: null
};
const transaction = { collectionTask: { findFirst: mocks.find, updateMany: mocks.claim, findUniqueOrThrow: mocks.updated } };

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ taskId: task.id, expectedVersion: "2", scheduledDate: "2026-10-16", notes: "Customer promises transfer Friday", status: "Planned", ...overrides })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("Collection task edit form saves", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.find.mockResolvedValue(task);
    mocks.claim.mockImplementation(async ({ data }) => {
      mocks.updated.mockResolvedValue({ ...task, ...data, version: 3 });
      return { count: 1 };
    });
    mocks.transaction.mockImplementation(async work => work(transaction));
  });

  it("updates an open schedule and notes while retaining Planned and the selected task", async () => {
    await expect(updateCollectionTask(form())).rejects.toThrow("REDIRECT:/collections?view=task-one&success=");
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledWith({
      where: { id: task.id, status: "Planned", version: 2 },
      data: { scheduledDate: new Date("2026-10-16T00:00:00Z"), notes: "Customer promises transfer Friday", status: "Planned", version: { increment: 1 } }
    });
    expect(mocks.find.mock.calls[0][0].where).toMatchObject({ customer: { portfolioOwnerUserId: "sales-a" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATED" }), { transaction });
  });

  it.each([ ["Done", "COMPLETED"], ["Cancelled", "CANCELLED"] ])("saves notes, schedule and %s together, with a reason and one version increment", async (status, action) => {
    await expect(updateCollectionTask(form({ status, confirmationNote: "Customer follow-up finished" })))
      .rejects.toThrow("REDIRECT:/collections?tab=done&view=task-one&success=");
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.claim.mock.calls[0][0].data).toMatchObject({
      status, notes: "Customer promises transfer Friday", scheduledDate: new Date("2026-10-16T00:00:00Z"), version: { increment: 1 }
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action, actionNote: "Customer follow-up finished",
      oldValue: expect.objectContaining({ status: "Planned", version: 2 }),
      newValue: expect.objectContaining({ status, version: 3, notes: "Customer promises transfer Friday" })
    }), { transaction });
  });

  it.each(["Done", "Cancelled"])("rejects %s without a reason before writing anything", async status => {
    await expect(updateCollectionTask(form({ status, confirmationNote: " " }))).rejects.toThrow("A%20reason%20is%20required");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an oversized reason and an invalid status", async () => {
    await expect(updateCollectionTask(form({ status: "Done", confirmationNote: "x".repeat(151) }))).rejects.toThrow("150%20characters");
    await expect(updateCollectionTask(form({ status: "Invalid" }))).rejects.toThrow("valid%20status");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["Done", "Cancelled"])("keeps an existing %s task closed", async status => {
    mocks.find.mockResolvedValue({ ...task, status });
    await expect(updateCollectionTask(form())).rejects.toThrow("changed%20in%20another%20session");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects stale versions and tasks outside the user's portfolio", async () => {
    mocks.find.mockResolvedValue({ ...task, version: 3 });
    await expect(updateCollectionTask(form())).rejects.toThrow("changed%20in%20another%20session");
    mocks.find.mockResolvedValue(null);
    await expect(updateCollectionTask(form())).rejects.toThrow("changed%20in%20another%20session");
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects a concurrent close without writing an audit entry", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    await expect(updateCollectionTask(form({ status: "Done", confirmationNote: "Finished" })))
      .rejects.toThrow("changed%20in%20another%20session");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves schedule-only callers and does not reassign customer or invoice", async () => {
    const data = form({ customerId: "other-customer", invoiceId: "other-invoice" });
    data.delete("status");
    await expect(updateCollectionTask(data)).rejects.toThrow("REDIRECT:/collections?success=");
    expect(mocks.claim.mock.calls[0][0].data).not.toHaveProperty("customerId");
    expect(mocks.claim.mock.calls[0][0].data).not.toHaveProperty("invoiceId");
  });
});
