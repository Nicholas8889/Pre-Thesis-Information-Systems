import type { DashboardAnalysis } from "@/lib/dashboard-analysis";
import { RefreshDashboardAnalysisButton } from "@/components/refresh-dashboard-analysis-button";

export function DashboardAnalysisStatus({ analysis }: { analysis: DashboardAnalysis }) {
  let message: string;
  if (!analysis.lastSucceededAt) {
    message = "Analisis historis belum tersedia.";
  } else {
    const date = new Intl.DateTimeFormat("id-ID", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta"
    }).format(analysis.lastSucceededAt);
    const time = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta"
    }).format(analysis.lastSucceededAt);
    const updated = `${date}, ${time} WIB`;
    message = analysis.stale
      ? `Analisis belum diperbarui. Terakhir berhasil ${updated}.`
      : `Diperbarui ${updated}`;
  }

  return (
    <p className={`min-w-0 flex-1 rounded-md border px-4 py-2 text-xs font-medium ${
      analysis.stale ? "border-warning/40 bg-warning/10 text-ink" : "border-line bg-white text-ink/70"
    }`}>
      {message}
    </p>
  );
}

export function DashboardAnalysisToolbar({
  analysis,
  canRefresh
}: {
  analysis: DashboardAnalysis;
  canRefresh: boolean;
}) {
  return (
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <DashboardAnalysisStatus analysis={analysis} />
      {canRefresh && <RefreshDashboardAnalysisButton />}
    </div>
  );
}
