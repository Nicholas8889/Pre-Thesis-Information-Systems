import type { Prisma } from "@prisma/client";
import { Eye } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { TableActionGroup, TableDetailsAction } from "@/components/table-actions";
import { ServerPagination } from "@/components/server-pagination";
import { TableSearchToolbar } from "@/components/table-search-toolbar";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

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
  const pagination = getCursorPagination(params);

  const where: Prisma.AuditTrailWhereInput = {
    ...(query
      ? {
          OR: [
            { recordReference: { contains: query } },
            { changeSummary: { contains: query } },
            { actionNote: { contains: query } },
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...getCursorArgs(pagination)
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
  const auditTrailPage = getCursorPage(auditTrailRecords, pagination);
  const visibleAuditTrailRecords = auditTrailPage.items;

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Central record of who changed data, what changed, which record was affected, and when it happened."
      />

      <div className="mb-4 rounded-md bg-info/10 px-4 py-3 text-sm text-ink">
        Audit Trail is read-only. Records are created automatically by the system and can be reviewed and filtered here.
      </div>

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <TableSearchToolbar
          defaultValue={query}
          placeholder="Record reference or keyword"
          resetHref="/audit-trail"
          loadedCount={visibleAuditTrailRecords.length}
        >
          <div className="table-search-filters" key={JSON.stringify([moduleName, actorUsername, action])}>
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
            </div>
          </div>
        </TableSearchToolbar>
        {visibleAuditTrailRecords.length === 0 ? (
          <EmptyState message="No audit trail records yet." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Date & Time</th>
                  <th className="py-3 pr-4">User</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Module</th>
                  <th className="py-3 pr-4">Record Reference</th>
                  <th className="py-3 pr-4">Action</th>
                  <th className="py-3 pr-4">Change Summary</th>
                  <th className="py-3 pr-4">Confirmation Note</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleAuditTrailRecords.map((record) => (
                  <tr key={record.id} className="align-top transition hover:bg-soft">
                    <td className="whitespace-nowrap py-3 pr-4 text-ink/80">
                      {formatDateTime(record.createdAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block font-medium">
                        {record.actorDisplayName ?? record.actorUsername}
                      </span>
                      <span className="block text-xs text-ink/70">
                        {record.actorUsername}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink/80">{record.actorRole}</td>
                    <td className="py-3 pr-4 text-ink/80">{record.moduleName}</td>
                    <td className="py-3 pr-4 font-medium">{record.recordReference}</td>
                    <td className="py-3 pr-4 text-ink/80">
                      {formatActionLabel(record.action)}
                    </td>
                    <td className="min-w-72 py-3 pr-4 text-ink/80">
                      {record.changeSummary}
                    </td>
                    <td className="min-w-56 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {record.actionNote ?? "-"}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        <TableDetailsAction
                          label="View audit record details"
                          icon={<Eye aria-hidden="true" />}
                        >
                          <div className="space-y-4 text-sm text-ink/80">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Detail label="User" value={`${record.actorDisplayName ?? record.actorUsername} (${record.actorUsername})`} />
                              <Detail label="Date & Time" value={formatDateTime(record.createdAt)} />
                              <Detail label="Record Reference" value={record.recordReference} />
                              <Detail label="Action" value={formatActionLabel(record.action)} />
                            </div>
                            <Detail label="Summary" value={record.changeSummary} />
                            <Detail label="Reason / Confirmation Note" value={record.actionNote ?? "-"} preserve />
                            <div className="grid gap-4 sm:grid-cols-2">
                              <section aria-label="Before" className="min-w-0 rounded-md bg-soft p-3">
                                <h3 className="mb-3 font-semibold">Before</h3><AuditValue value={record.oldValue} />
                              </section>
                              <section aria-label="After" className="min-w-0 rounded-md bg-soft p-3">
                                <h3 className="mb-3 font-semibold">After</h3><AuditValue value={record.newValue} />
                              </section>
                            </div>
                          </div>
                        </TableDetailsAction>
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={auditTrailPage.hasNext}
          label="audit records"
          nextCursor={auditTrailPage.nextCursor}
          pathname="/audit-trail"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}

function AuditValue({ value }: { value: string | null }) {
  if (!value) return <p>—</p>;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return <p className="whitespace-pre-wrap break-words">{value}</p>; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return <p className="whitespace-pre-wrap break-words">{value}</p>;
  }
  const labels: Record<string, string> = { approvalStatus: "Approval Status", decisionNote: "Decision Reason",
    paymentStatusAtDecision: "Customer Payment Status", outstandingAtDecision: "Customer Outstanding Amount" };
  return <dl className="space-y-3">{Object.entries(parsed).map(([key, entry]) => (
    <div key={key} className="min-w-0">
      <dt className="text-xs font-semibold text-ink/60">{labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase())}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{entry === null ? "—" : typeof entry === "object" ? JSON.stringify(entry, null, 2) : String(entry)}</dd>
    </div>
  ))}</dl>;
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
    <label className="text-sm font-medium text-ink">
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
      <p className="font-semibold uppercase text-ink/50">{label}</p>
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
