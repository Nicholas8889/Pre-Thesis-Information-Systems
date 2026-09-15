import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardAnalysisStatus, DashboardAnalysisToolbar } from "@/components/dashboard-analysis-status";

const baseAnalysis = {
  trend: [{ label: "Sep", sales: 10, payments: 5 }],
  lastSucceededAt: new Date("2026-09-14T17:15:00Z"),
  lastRunStatus: "SUCCEEDED" as const,
  stale: false
};

describe("dashboard analysis timestamp", () => {
  it("formats the actual successful timestamp in WIB", () => {
    const html = renderToStaticMarkup(createElement(DashboardAnalysisStatus, {
      analysis: baseAnalysis
    }));
    expect(html).toContain("Diperbarui 15 September 2026, 00.15 WIB");
  });

  it("labels failed or overdue analysis while keeping the last successful timestamp", () => {
    const html = renderToStaticMarkup(createElement(DashboardAnalysisStatus, {
      analysis: { ...baseAnalysis, lastRunStatus: "FAILED", stale: true }
    }));
    expect(html).toContain("Analisis belum diperbarui.");
    expect(html).toContain("Terakhir berhasil 15 September 2026, 00.15 WIB");
  });

  it("shows the manual refresh control only for roles allowed by the dashboard", () => {
    const sales = renderToStaticMarkup(createElement(DashboardAnalysisToolbar, {
      analysis: baseAnalysis, canRefresh: false
    }));
    const manager = renderToStaticMarkup(createElement(DashboardAnalysisToolbar, {
      analysis: baseAnalysis, canRefresh: true
    }));
    expect(sales).not.toContain("Perbarui Analisis");
    expect(manager).toContain("Perbarui Analisis");
    expect(manager).toContain('data-no-action-confirmation="true"');
  });

  it("does not fabricate a timestamp when there is no successful run", () => {
    const html = renderToStaticMarkup(createElement(DashboardAnalysisStatus, {
      analysis: { trend: [], lastSucceededAt: null, lastRunStatus: "MISSING", stale: true }
    }));
    expect(html).toContain("Analisis historis belum tersedia.");
    expect(html).not.toContain("Diperbarui");
  });
});
