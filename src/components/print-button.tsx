"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print Invoice" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
    >
      <Printer aria-hidden="true" className="h-4 w-4" />
      {label}
    </button>
  );
}
