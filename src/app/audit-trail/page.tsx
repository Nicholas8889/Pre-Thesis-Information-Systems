import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function AuditTrailPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const query = getFirst(params.q)?.trim();
  const moduleName = getFirst(params.moduleName);
  const actorUsername = getFirst(params.actorUsername);
  const action = getFirst(params.action);

  const where: Prisma.AuditTrailWhereInput = {
    ...(query
      ? {
          OR: [
            { transactionCode: { contains: query } },
            { changeSummary: { contains: query } },
            { actorUsername: { contains: query } },
            { actorDisplayName: { contains: query } },
            { moduleName: { contains: query } },
            { action: { contains: query } }
          ]
        }
      : {}),
    ...(moduleName ? { moduleName } : {}),
    ...(actorUsername ? { actorUsername } : {}),
    ...(action ? { action } : {})
  };

  const [auditTrailRecords, moduleOptions, userOptions, actionOptions] = await Promise.all([
    prisma.auditTrail.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    prisma.auditTrail.findMany({
      distinct: ["moduleName"],
      orderBy: { moduleName: "asc" },
      select: { moduleName: true }
    }),
    prisma.auditTrail.findMany({
      distinct: ["actorUsername"],
      orderBy: { actorUsername: "asc" },
      select: { actorUsername: true, actorDisplayName: true }
    }),
    prisma.auditTrail.findMany({
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true }
    })
  ]);

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Central record of who changed data, what changed, which transaction was affected, and when it happened."
      />

      <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Audit Trail is read-only. Records are created automatically by the system; Admin can review and filter them but cannot create manual entries.
      </div>

      <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
        <form className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <label className="text-sm font-medium text-slate-700">
            Search
            <span className="mt-1 flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <input
                name="q"
                defaultValue={query}
                className="w-full text-sm outline-none"
                placeholder="Transaction code or keyword"
              />
            </span>
          </label>

          <FilterSelect
            label="Module"
            name="moduleName"
            value={moduleName}
            options={moduleOptions.map((item) => ({
              value: item.moduleName,
              label: item.moduleName
            }))}
          />

          <FilterSelect
            label="User"
            name="actorUsername"
            value={actorUsername}
            options={userOptions.map((item) => ({
              value: item.actorUsername,
              label: item.actorDisplayName
                ? `${item.actorDisplayName} (${item.actorUsername})`
                : item.actorUsername
            }))}
          />

          <FilterSelect
            label="Action"
            name="action"
            value={action}
            options={actionOptions.map((item) => ({
              value: item.action,
              label: formatActionLabel(item.action)
            }))}
          />

          <div className="flex items-end gap-2">
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
              Apply
            </button>
            <a
              href="/audit-trail"
              className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-600"
            >
              Reset
            </a>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        {auditTrailRecords.length === 0 ? (
          <EmptyState message="No audit trail records yet." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Date & Time</th>
                  <th className="py-3 pr-4">User</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Module</th>
                  <th className="py-3 pr-4">Transaction Code</th>
                  <th className="py-3 pr-4">Action</th>
                  <th className="py-3 pr-4">Change Summary</th>
                  <th className="py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {auditTrailRecords.map((record) => (
                  <tr key={record.id} className="align-top transition hover:bg-slate-50">
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                      {formatDateTime(record.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block font-medium">
                        {record.actorDisplayName ?? record.actorUsername}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {record.actorUsername}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{record.actorRole}</td>
                    <td className="py-3 pr-4 text-slate-600">{record.moduleName}</td>
                    <td className="py-3 pr-4 font-medium">{record.transactionCode}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatActionLabel(record.action)}
                    </td>
                    <td className="min-w-72 py-3 pr-4 text-slate-600">
                      {record.changeSummary}
                    </td>
                    <td className="min-w-64 py-3">
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-brand">
                          View
                        </summary>
                        <div className="mt-3 space-y-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                          <Detail label="Entity ID" value={record.entityId} />
                          <Detail label="Entity Type" value={record.entityType} />
                          <Detail label="Full Summary" value={record.changeSummary} />
                          <Detail label="Old Value" value={record.oldValue ?? "-"} preserve />
                          <Detail label="New Value" value={record.newValue ?? "-"} preserve />
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options
}: {
  label: string;
  name: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select name={name} defaultValue={value ?? ""} className={`${inputClass} mt-1`}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Detail({
  label,
  value,
  preserve = false
}: {
  label: string;
  value: string;
  preserve?: boolean;
}) {
  return (
    <div>
      <p className="font-semibold uppercase text-slate-400">{label}</p>
      <p className={preserve ? "mt-1 whitespace-pre-wrap break-words" : "mt-1 break-words"}>
        {value}
      </p>
    </div>
  );
}

function formatActionLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
