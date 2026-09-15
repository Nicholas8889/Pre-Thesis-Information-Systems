"use server";

import { refresh } from "next/cache";
import { refreshDashboardAnalysisManually } from "@/lib/dashboard-analysis";
import { requireCurrentUser } from "@/lib/session";

export type RefreshDashboardAnalysisState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function refreshDashboardAnalysisAction(
  previousState: RefreshDashboardAnalysisState,
  formData: FormData
): Promise<RefreshDashboardAnalysisState> {
  void previousState;
  void formData;
  const user = await requireCurrentUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return { status: "error", message: "Anda tidak berhak memperbarui analisis." };
  }

  let result: RefreshDashboardAnalysisState;
  try {
    await refreshDashboardAnalysisManually();
    result = { status: "success", message: "Analisis berhasil diperbarui." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    result = {
      status: "error",
      message: message.includes("already running")
        ? "Analisis sedang dihitung oleh proses lain. Coba lagi sebentar."
        : message.includes("failed; the last successful result")
          ? "Perhitungan analisis gagal. Ringkasan terakhir tetap tersedia."
          : "Analisis tidak dapat diperbarui. Coba lagi sebentar."
    };
  }

  // The dashboard is dynamic: refresh the current route so a successful run
  // replaces the graph and a failed run shows the preserved, stale snapshot.
  refresh();
  return result;
}
