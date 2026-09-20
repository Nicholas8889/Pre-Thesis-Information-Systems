"use client";

import { useState } from "react";
import { FileSpreadsheet, Search, X } from "lucide-react";

type CustomerStatusFilter = "ALL" | "Active" | "Inactive";

export function CustomerExportDialog({ initialQuery = "" }: { initialQuery?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<CustomerStatusFilter>("ALL");
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  async function downloadCustomers() {
    setError("");
    setIsDownloading(true);

    try {
      const searchParams = new URLSearchParams({ status });
      if (query.trim()) searchParams.set("q", query.trim());
      const response = await fetch(`/api/customers/export?${searchParams.toString()}`);

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(result?.error ?? "Customer download failed.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") ?? "";
      const fileName =
        contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? "customers.xlsx";
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
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Customer download failed."
      );
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
        <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
        Ekspor Excel Customer
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-strong/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-export-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 id="customer-export-title" className="text-lg font-semibold text-ink">
                  Ekspor Excel Customer
                </h2>
                <p className="mt-1 text-sm text-ink/80">
                  Pilih customer yang ingin dimasukkan ke workbook.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink/70"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block text-sm font-medium text-ink">
                Customer Status
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as CustomerStatusFilter)
                  }
                  className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
                >
                  <option value="ALL">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-ink">
                Search (Optional)
                <span className="relative mt-1 block">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/50"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name, company, phone, or email"
                    className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-brand"
                  />
                </span>
              </label>

              {error && (
                <p className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white">
                  {error}
                </p>
              )}

              <p className="rounded-md bg-info/10 px-3 py-2 text-xs leading-5 text-ink">
                Workbook mencakup master data, status pembayaran, outstanding payment,
                dan payment behaviour 12 bulan terakhir.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={downloadCustomers}
                disabled={isDownloading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                {isDownloading ? "Menyiapkan Excel..." : "Ekspor Excel"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
