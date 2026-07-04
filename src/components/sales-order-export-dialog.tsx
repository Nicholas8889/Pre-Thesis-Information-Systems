"use client";

import { useState } from "react";
import { CalendarDays, Download, X } from "lucide-react";

export function SalesOrderExportDialog({
  transactionType = "SALES_ORDER"
}: {
  transactionType?: "SALES_ORDER" | "PRE_ORDER";
}) {
  const isPreOrder = transactionType === "PRE_ORDER";
  const label = isPreOrder ? "Pre Order" : "Sales Order";
  const today = toDateInputValue(new Date());
  const firstDay = toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadSalesOrders() {
    if (!startDate || !endDate) {
      setError("Start date and end date are required.");
      return;
    }

    if (startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }

    setError("");
    setIsDownloading(true);

    try {
      const response = await fetch(
        `/api/sales-orders/export?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&transactionType=${transactionType}`
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "Sales Order download failed.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const fileName = contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? `${isPreOrder ? "pre-orders" : "sales-orders"}-${startDate}-${endDate}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setIsOpen(false);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Sales Order download failed.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-brand"
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Download {label} Data
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-order-export-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id="sales-order-export-title" className="text-lg font-semibold text-ink">
                  Download {label} Data
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Choose the {label} date range to include in the Excel file.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-slate-500"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Start Date
                  <span className="relative mt-1 block">
                    <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={startDate}
                      max={endDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-brand"
                    />
                  </span>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  End Date
                  <span className="relative mt-1 block">
                    <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      max={today}
                      onChange={(event) => setEndDate(event.target.value)}
                      className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-brand"
                    />
                  </span>
                </label>
              </div>

              {error && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                  {error}
                </p>
              )}

              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 ring-1 ring-inset ring-blue-200">
                The workbook contains an order summary sheet and an item-detail sheet.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadSalesOrders}
                disabled={isDownloading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                {isDownloading ? "Preparing Excel..." : "Download Excel"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function toDateInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}
