import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "good" | "warning";
}) {
  const toneClass = {
    neutral: "bg-accent text-strong",
    good: "bg-success text-white",
    warning: "bg-warning text-strong"
  }[tone];

  return (
    <section className="rounded-md border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
    </section>
  );
}
