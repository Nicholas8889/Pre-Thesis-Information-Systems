import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requireCurrentUser: vi.fn(),
  refreshDashboardAnalysisManually: vi.fn()
}));

vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/dashboard-analysis", () => ({
  refreshDashboardAnalysisManually: mocks.refreshDashboardAnalysisManually
}));

import { refreshDashboardAnalysisAction } from "@/lib/dashboard-analysis-actions";

const initialState = { status: "idle" as const, message: "" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({ id: "admin-a", role: "ADMIN" });
  mocks.refreshDashboardAnalysisManually.mockResolvedValue(BigInt(1));
});

describe("manual dashboard analysis action", () => {
  it.each(["ADMIN", "MANAGER"] as const)("allows %s and refreshes the displayed graph", async (role) => {
    mocks.requireCurrentUser.mockResolvedValue({ id: role, role });
    const result = await refreshDashboardAnalysisAction(initialState, new FormData());
    expect(result).toEqual({ status: "success", message: "Analisis berhasil diperbarui." });
    expect(mocks.refreshDashboardAnalysisManually).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("blocks Sales even if the action is called directly outside the UI", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "sales-a", role: "SALES" });
    expect(await refreshDashboardAnalysisAction(initialState, new FormData()))
      .toEqual({ status: "error", message: "Anda tidak berhak memperbarui analisis." });
    expect(mocks.refreshDashboardAnalysisManually).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("stops before calculating when authentication fails", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new Error("No session"));
    await expect(refreshDashboardAnalysisAction(initialState, new FormData()))
      .rejects.toThrow("No session");
    expect(mocks.refreshDashboardAnalysisManually).not.toHaveBeenCalled();
  });

  it("reports a concurrent run and refreshes the dashboard status", async () => {
    mocks.refreshDashboardAnalysisManually.mockRejectedValue(
      new Error("Dashboard analysis is already running")
    );
    expect(await refreshDashboardAnalysisAction(initialState, new FormData())).toEqual({
      status: "error", message: "Analisis sedang dihitung oleh proses lain. Coba lagi sebentar."
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("reports manual calculation failure while leaving the last snapshot visible", async () => {
    mocks.refreshDashboardAnalysisManually.mockRejectedValue(
      new Error("Dashboard analysis failed; the last successful result is still available")
    );
    expect(await refreshDashboardAnalysisAction(initialState, new FormData())).toEqual({
      status: "error", message: "Perhitungan analisis gagal. Ringkasan terakhir tetap tersedia."
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a safe message when the database request itself fails", async () => {
    mocks.refreshDashboardAnalysisManually.mockRejectedValue(new Error("database connection string"));
    expect(await refreshDashboardAnalysisAction(initialState, new FormData())).toEqual({
      status: "error", message: "Analisis tidak dapat diperbarui. Coba lagi sebentar."
    });
  });
});
