"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import {
  refreshDashboardAnalysisAction,
  type RefreshDashboardAnalysisState
} from "@/lib/dashboard-analysis-actions";

const initialState: RefreshDashboardAnalysisState = { status: "idle", message: "" };

export function RefreshDashboardAnalysisButton() {
  const [state, action, pending] = useActionState(refreshDashboardAnalysisAction, initialState);

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
      <form action={action} data-no-action-confirmation="true">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Memperbarui Analisis…" : "Perbarui Analisis"}
        </button>
      </form>
      {(pending || state.status !== "idle") && (
        <p
          role={!pending && state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`max-w-xs text-xs font-medium ${state.status === "error" && !pending ? "text-danger" : "text-ink/70"}`}
        >
          {pending ? "Menghitung ringkasan dashboard…" : state.message}
        </p>
      )}
    </div>
  );
}
