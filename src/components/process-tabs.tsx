import Link from "next/link";
import { clsx } from "clsx";
import type { SearchParams } from "@/lib/pagination";

export type ProcessTab = "ongoing" | "done";
export type ProcessTabWithApproval = ProcessTab | "approval";

export function normalizeProcessTab(value: string | string[] | undefined): ProcessTab {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "done" ? "done" : "ongoing";
}

export function ProcessTabs({
  basePath,
  activeTab,
  ongoingCount,
  doneCount,
  approvalCount,
  searchParams,
  preserveParams,
}: {
  basePath: string;
  activeTab: ProcessTabWithApproval;
  ongoingCount: number;
  doneCount: number;
  approvalCount?: number;
  searchParams?: SearchParams;
  preserveParams?: readonly string[];
}) {
  const tabs = [
    { value: "ongoing" as const, label: "Open", count: ongoingCount },
    ...(approvalCount === undefined
      ? []
      : [{ value: "approval" as const, label: "Need Approval", count: approvalCount }]),
    { value: "done" as const, label: "Completed", count: doneCount }
  ];

  return (
    <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-sm sm:inline-flex">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value;

        return (
          <Link
            key={tab.value}
            href={createProcessTabHref(basePath, tab.value, searchParams, preserveParams)}
            className={clsx(
              "inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold transition",
              isActive ? "bg-brand text-white" : "text-ink/80 hover:bg-soft hover:text-ink"
            )}
          >
            {tab.label}
            <span
              className={clsx(
                "ml-2 rounded-md px-1.5 py-0.5 text-xs",
                isActive ? "bg-white/15 text-white" : "bg-canvas text-ink/80"
              )}
            >
              {tab.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function createProcessTabHref(
  basePath: string,
  tab: ProcessTabWithApproval,
  searchParams: SearchParams = {},
  preserveParams: readonly string[] = [],
) {
  const query = new URLSearchParams();
  const allowed = new Set(preserveParams);
  for (const [key, value] of Object.entries(searchParams)) {
    if (!allowed.has(key)) continue;
    if (Array.isArray(value)) value.forEach(entry => query.append(key, entry));
    else if (value) query.set(key, value);
  }
  if (tab === "ongoing") query.delete("tab");
  else query.set("tab", tab);
  const queryString = query.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
