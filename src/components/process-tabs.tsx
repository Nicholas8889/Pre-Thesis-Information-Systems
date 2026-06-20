import Link from "next/link";
import { clsx } from "clsx";

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
  approvalCount
}: {
  basePath: string;
  activeTab: ProcessTabWithApproval;
  ongoingCount: number;
  doneCount: number;
  approvalCount?: number;
}) {
  const tabs = [
    ...(approvalCount === undefined
      ? []
      : [{ value: "approval" as const, label: "Need Approval", count: approvalCount }]),
    { value: "ongoing" as const, label: "Ongoing Process", count: ongoingCount },
    { value: "done" as const, label: "Done Process", count: doneCount }
  ];

  return (
    <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-sm sm:inline-flex">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value;

        return (
          <Link
            key={tab.value}
            href={
              tab.value === "ongoing" ? basePath : `${basePath}?tab=${tab.value}`
            }
            className={clsx(
              "inline-flex h-9 shrink-0 items-center justify-center rounded-md px-3 text-sm font-semibold transition",
              isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
            )}
          >
            {tab.label}
            <span
              className={clsx(
                "ml-2 rounded-md px-1.5 py-0.5 text-xs",
                isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
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
