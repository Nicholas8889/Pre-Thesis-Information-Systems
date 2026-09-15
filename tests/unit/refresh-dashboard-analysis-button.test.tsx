import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useActionState: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: mocks.useActionState
}));

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RefreshDashboardAnalysisButton } from "@/components/refresh-dashboard-analysis-button";

beforeEach(() => {
  mocks.useActionState.mockReturnValue([
    { status: "idle", message: "" }, "/dashboard", false
  ]);
});

describe("manual analysis button feedback", () => {
  it("disables the button and announces progress while the calculation is pending", () => {
    mocks.useActionState.mockReturnValue([
      { status: "idle", message: "" }, "/dashboard", true
    ]);
    const html = renderToStaticMarkup(createElement(RefreshDashboardAnalysisButton));
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Memperbarui Analisis");
    expect(html).toContain("Menghitung ringkasan dashboard");
    expect(html).toContain("animate-spin");
  });

  it("announces calculation failure without disabling future retries", () => {
    mocks.useActionState.mockReturnValue([
      { status: "error", message: "Perhitungan analisis gagal. Ringkasan terakhir tetap tersedia." },
      "/dashboard", false
    ]);
    const html = renderToStaticMarkup(createElement(RefreshDashboardAnalysisButton));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Ringkasan terakhir tetap tersedia.");
    expect(html).not.toContain('disabled=""');
  });

  it("announces a successful refresh", () => {
    mocks.useActionState.mockReturnValue([
      { status: "success", message: "Analisis berhasil diperbarui." },
      "/dashboard", false
    ]);
    const html = renderToStaticMarkup(createElement(RefreshDashboardAnalysisButton));
    expect(html).toContain('role="status"');
    expect(html).toContain("Analisis berhasil diperbarui.");
  });
});
