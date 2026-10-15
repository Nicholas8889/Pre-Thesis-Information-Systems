import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireCurrentUser: vi.fn(), query: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.query, dashboardAnalysisRun: { findUnique: mocks.findUnique } } }));
import { refreshDashboardAnalysisManually } from "@/lib/dashboard-analysis";

beforeEach(() => { vi.resetAllMocks(); mocks.requireCurrentUser.mockResolvedValue({ id: "manager", role: "MANAGER" }); });
describe("shared analysis schema boundary", () => {
  it("stops before invoking the shared routine from an isolated schema", async () => {
    mocks.query.mockResolvedValue([{ schema: "sit_umkm_isolated" }]);
    await expect(refreshDashboardAnalysisManually()).rejects.toThrow("cannot run outside");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(String(mocks.query.mock.calls[0][0])).not.toContain("dashboard_private");
  });
  it("allows the real application schema and checks the completed run", async () => {
    mocks.query.mockResolvedValueOnce([{ schema: "public" }]).mockResolvedValueOnce([{ runId: BigInt(7) }]);
    mocks.findUnique.mockResolvedValue({ id: BigInt(7), status: "SUCCEEDED" });
    await expect(refreshDashboardAnalysisManually()).resolves.toBe(BigInt(7));
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("rejects Sales before making a database request", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "sales", role: "SALES" });
    await expect(refreshDashboardAnalysisManually()).rejects.toThrow("Only Admin and Manager");
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
