import { describe, expect, it, vi } from "vitest";
import {
  dashboardAnalysisScopeKey,
  getDashboardAnalysis,
  latestExpectedAnalysisRun
} from "@/lib/dashboard-analysis";

describe("dashboard analysis reader", () => {
  it("uses a company snapshot for Manager/Admin and a private snapshot for each Sales user", async () => {
    const findUnique = vi.fn(async ({ where }: { where: { scopeKey: string } }) => ({
      scopeType: where.scopeKey === "company" ? "COMPANY" : "SALES",
      ownerUserId: where.scopeKey === "company" ? null : where.scopeKey.slice(6),
      trend: [{ label: "Sep", sales: 4, payments: 2 }],
      lastSucceededAt: new Date("2026-09-14T17:15:00Z"),
      lastRunStatus: "SUCCEEDED"
    }));
    const reader = { dashboardAnalysisSnapshot: { findUnique } } as never;
    const now = new Date("2026-09-14T17:31:00Z");

    for (const role of ["ADMIN", "MANAGER"] as const) {
      expect(dashboardAnalysisScopeKey({ id: role, role })).toBe("company");
      expect((await getDashboardAnalysis({ id: role, role }, now, reader)).trend[0].sales).toBe(4);
    }
    for (const id of ["sales-a", "sales-b"]) {
      expect(dashboardAnalysisScopeKey({ id, role: "SALES" })).toBe("sales:" + id);
      expect((await getDashboardAnalysis({ id, role: "SALES" }, now, reader)).trend[0].payments).toBe(2);
    }
    expect(findUnique.mock.calls.map(([input]) => input.where.scopeKey)).toEqual([
      "company", "company", "sales:sales-a", "sales:sales-b"
    ]);
  });

  it("rejects a snapshot whose owner does not match the Sales user", async () => {
    const reader = {
      dashboardAnalysisSnapshot: {
        findUnique: async () => ({
          scopeType: "SALES", ownerUserId: "sales-b", trend: [],
          lastSucceededAt: new Date(), lastRunStatus: "SUCCEEDED"
        })
      }
    } as never;
    await expect(getDashboardAnalysis({ id: "sales-a", role: "SALES" }, new Date(), reader))
      .rejects.toThrow("scope mismatch");
  });

  it("keeps the previous run valid until 00:30 WIB, then marks it stale if the night job did not succeed", async () => {
    expect(latestExpectedAnalysisRun(new Date("2026-09-14T17:29:00Z")).toISOString())
      .toBe("2026-09-13T17:15:00.000Z");
    expect(latestExpectedAnalysisRun(new Date("2026-09-14T17:30:00Z")).toISOString())
      .toBe("2026-09-14T17:15:00.000Z");

    const snapshot = {
      scopeType: "COMPANY", ownerUserId: null, trend: [],
      lastSucceededAt: new Date("2026-09-13T17:15:00Z"),
      lastRunStatus: "SUCCEEDED"
    };
    const reader = { dashboardAnalysisSnapshot: { findUnique: async () => snapshot } } as never;
    const user = { id: "manager", role: "MANAGER" as const };
    expect((await getDashboardAnalysis(user, new Date("2026-09-14T17:29:00Z"), reader)).stale).toBe(false);
    expect((await getDashboardAnalysis(user, new Date("2026-09-14T17:30:00Z"), reader)).stale).toBe(true);
    snapshot.lastRunStatus = "FAILED";
    expect((await getDashboardAnalysis(user, new Date("2026-09-14T17:29:00Z"), reader)).stale).toBe(true);
  });

  it("reports a missing snapshot without inventing an update time", async () => {
    const reader = { dashboardAnalysisSnapshot: { findUnique: async () => null } } as never;
    expect(await getDashboardAnalysis({ id: "sales-a", role: "SALES" }, new Date(), reader))
      .toEqual({ trend: [], lastSucceededAt: null, lastRunStatus: "MISSING", stale: true });
  });
});
