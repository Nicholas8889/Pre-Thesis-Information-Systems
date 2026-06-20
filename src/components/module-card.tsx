import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export function ModuleCard({
  href,
  title,
  description,
  icon: Icon
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-36 flex-col justify-between rounded-md border border-slate-200 bg-white p-5 shadow-soft transition hover:border-brand hover:shadow-md"
    >
      <div>
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-brand ring-1 ring-inset ring-slate-200">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
        Open <ArrowRight aria-hidden="true" className="h-4 w-4 transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
