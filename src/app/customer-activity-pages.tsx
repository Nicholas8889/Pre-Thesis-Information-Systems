import { recordCustomerOutreach } from "@/lib/actions";
import { CollectionTaskForm } from "@/components/collection-task-form";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { ServerPagination } from "@/components/server-pagination";
import { TableSearchToolbar } from "@/components/table-search-toolbar";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  DONE_COLLECTION_TASK_STATUSES,
  ONGOING_COLLECTION_TASK_STATUSES
} from "@/lib/process-status";
import { getSearchMessage, toDateInputValue } from "@/lib/workflow";
import { getOpenInvoiceWhere } from "@/lib/invoice-status";
import { Eye, PhoneCall } from "lucide-react";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";
import { requireCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import {
  buildOutreachCustomerWhere,
  OUTREACH_CUSTOMER_ORDER,
  OUTREACH_LATEST_ORDER,
} from "@/lib/outreach-query";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export async function CollectionsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCustomerId = getFirst(params.customerId);
  const selectedInvoiceId = getFirst(params.invoiceId);
  const selectedTaskId = getFirst(params.view);
  const { success, error } = getSearchMessage(params);
  const pagination = getCursorPagination(params);
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const selectedTask = selectedTaskId ? await prisma.collectionTask.findFirst({
    where: { id: selectedTaskId, ...portfolio.collectionTaskWhere },
    include: {
      customer: true,
      invoice: { include: { salesOrder: { select: { id: true, orderNumber: true } } } }
    }
  }) : null;
  const activeTab = params.tab
    ? normalizeProcessTab(params.tab)
    : selectedTask && selectedTask.status !== "Planned" ? "done" : "ongoing";
  const visibleStatuses =
    activeTab === "done"
      ? [...DONE_COLLECTION_TASK_STATUSES]
      : [...ONGOING_COLLECTION_TASK_STATUSES];

  const [customers, openInvoices, collectionTaskRecords, ongoingCount, doneCount] =
    await Promise.all([
    activeTab === "ongoing" ? prisma.customer.findMany({
      where: { status: "Active", ...portfolio.customerWhere },
      orderBy: [{ companyName: "asc" }, { id: "asc" }]
    }) : Promise.resolve([]),
    activeTab === "ongoing" ? prisma.invoice.findMany({
      where: { ...getOpenInvoiceWhere(), ...portfolio.invoiceWhere },
      include: { customer: true },
      orderBy: { dueDate: "asc" }
    }) : Promise.resolve([]),
    prisma.collectionTask.findMany({
      where: { status: { in: visibleStatuses }, ...portfolio.collectionTaskWhere },
      orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
      ...getCursorArgs(pagination),
      include: {
        customer: true,
        invoice: {
          include: {
            salesOrder: {
              select: {
                id: true,
                orderNumber: true
              }
            }
          }
        }
      }
    }),
    prisma.collectionTask.count({
      where: { status: { in: [...ONGOING_COLLECTION_TASK_STATUSES] }, ...portfolio.collectionTaskWhere }
    }),
    prisma.collectionTask.count({
      where: { status: { in: [...DONE_COLLECTION_TASK_STATUSES] }, ...portfolio.collectionTaskWhere }
    })
  ]);

  const selectedInvoice = openInvoices.find((invoice) => invoice.id === selectedInvoiceId);
  const collectionTaskPage = getCursorPage(collectionTaskRecords, pagination);
  const visibleCollectionTasks = collectionTaskPage.items;

  function taskHref(taskId: string) {
    const query = new URLSearchParams({ tab: activeTab, view: taskId });
    for (const key of [pagination.cursorParam, pagination.historyParam]) {
      const value = getFirst(params[key]);
      if (value) query.set(key, value);
    }
    return `/collections?${query.toString()}#collection-task-form`;
  }

  return (
    <>
      <PageHeader
        title="Collections"
        description="Track planned and completed payment collection activities."
      />

      <FlashMessage success={success} error={error ?? (selectedTaskId && !selectedTask ? "Collection task is unavailable or outside your portfolio." : undefined)} />

      <ProcessTabs
        basePath="/collections"
        activeTab={activeTab}
        ongoingCount={ongoingCount}
        doneCount={doneCount}
      />

      {(activeTab === "ongoing" || selectedTask) && (
        <section id="collection-task-form" className="mb-6 scroll-mt-4 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">
            {selectedTask ? selectedTask.status === "Planned" ? "Edit Collection Task" : "Collection Task Details" : "Add Collection Task"}
          </h2>
          {!selectedTask && customers.length === 0 ? (
            <EmptyState message="Add an active customer before creating a collection task." />
          ) : (
            <CollectionTaskForm
              key={selectedTask ? `${selectedTask.id}-${selectedTask.version}` : `new-${selectedCustomerId ?? ""}-${selectedInvoiceId ?? ""}`}
              customers={customers}
              invoices={openInvoices.map(invoice => ({
                id: invoice.id,
                customerId: invoice.customerId,
                invoiceNumber: invoice.invoiceNumber,
                companyName: invoice.customer.companyName,
                remainingAmount: invoice.remainingAmount
              }))}
              customerId={selectedCustomerId ?? selectedInvoice?.customerId}
              invoiceId={selectedInvoiceId}
              scheduledDate={toDateInputValue(selectedTask?.scheduledDate)}
              notes={selectedTask?.notes ?? (selectedInvoice
                ? `Collect remaining payment of ${formatCurrency(selectedInvoice.remainingAmount)} for ${selectedInvoice.invoiceNumber}`
                : "")}
              task={selectedTask ? {
                id: selectedTask.id,
                version: selectedTask.version,
                status: selectedTask.status,
                customerName: `${selectedTask.customer.companyName} - ${selectedTask.customer.name}`,
                invoiceNumber: selectedTask.invoice?.invoiceNumber,
                salesOrderId: selectedTask.invoice?.salesOrderId
              } : undefined}
            />
          )}
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Collection Tasks</h2>
        {visibleCollectionTasks.length === 0 ? (
          <EmptyState
            message={
              activeTab === "done"
                ? "No completed collection tasks."
                : "No ongoing collection tasks."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Sales Order</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleCollectionTasks.map((collectionTask) => (
                  <tr key={collectionTask.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">
                      {collectionTask.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {collectionTask.invoice?.invoiceNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {collectionTask.invoice?.salesOrder.orderNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {formatDate(collectionTask.scheduledDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={collectionTask.status} />
                      </StatusStack>
                    </td>
                    <td className="py-3 pr-4 text-ink/80">{collectionTask.notes}</td>
                    <td className="py-3">
                      <TableActionGroup>
                        <TableActionLink href={taskHref(collectionTask.id)} label="View Collection Task">
                          <Eye aria-hidden="true" />
                        </TableActionLink>
                      </TableActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={collectionTaskPage.hasNext}
          label="collection tasks"
          nextCursor={collectionTaskPage.nextCursor}
          pathname="/collections"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}

export async function CustomerOutreachPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCustomerId = getFirst(params.customerId);
  const query = getFirst(params.q)?.trim() ?? "";
  const { success, error } = getSearchMessage(params);
  const pagination = getCursorPagination(params);
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);

  const [allCustomers, customerRecords] = await Promise.all([
    prisma.customer.findMany({
      where: portfolio.customerWhere,
      orderBy: [{ companyName: "asc" }, { id: "asc" }],
      select: { id: true, companyName: true, name: true }
    }),
    prisma.customer.findMany({
      where: buildOutreachCustomerWhere(query, portfolio.customerWhere),
      orderBy: OUTREACH_CUSTOMER_ORDER,
      ...getCursorArgs(pagination),
      include: {
        outreachActivities: {
          orderBy: OUTREACH_LATEST_ORDER,
          take: 1
        }
      }
    })
  ]);
  const customerPage = getCursorPage(customerRecords, pagination);
  const customers = customerPage.items;

  return (
    <>
      <PageHeader
        title="Customer Outreach"
        description="Track the last time each customer was contacted to share information about new products."
      />

      <FlashMessage success={success} error={error} />

      <section id="record-outreach" className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Record Customer Contact</h2>
          <p className="mt-1 text-sm text-ink/80">
            Save when the customer was contacted. A note about the product or conversation is optional.
          </p>
        </div>

        {allCustomers.length === 0 ? (
          <EmptyState message="Add a customer before recording customer outreach." />
        ) : (
          <form
            key={selectedCustomerId ?? "no-customer-selected"}
            action={recordCustomerOutreach}
            className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_1.6fr_auto]"
          >
            <label className="text-sm font-medium text-ink">
              Customer
              <select
                name="customerId"
                required
                defaultValue={selectedCustomerId ?? ""}
                className={`${inputClass} mt-1 h-10`}
              >
                <option value="">Select customer</option>
                {allCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName} - {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-ink">
              Last Contact Date
              <input
                name="contactDate"
                type="date"
                required
                max={toDateInputValue()}
                defaultValue={toDateInputValue()}
                className={`${inputClass} mt-1 h-10`}
              />
            </label>

            <label className="text-sm font-medium text-ink">
              Optional Note
              <input
                name="notes"
                placeholder="Example: Introduced the new seasonal product range"
                className={`${inputClass} mt-1 h-10`}
              />
            </label>

            <div className="flex items-end">
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white lg:w-auto">
                <PhoneCall aria-hidden="true" className="h-4 w-4" />
                Record Contact
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Customer Outreach</h2>
            <p className="mt-1 text-sm text-ink/70">All customers and their latest product-information contact.</p>
          </div>
        </div>
        <TableSearchToolbar
          defaultValue={query}
          placeholder="Search customer or outreach note"
          resetHref="/customer-outreach"
          loadedCount={customers.length}
        />

        {customers.length === 0 ? (
          <EmptyState message="No customers match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Contact Person</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">Last Contact</th>
                  <th className="py-3 pr-4">Last Note</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {customers.map((customer) => {
                  const latestContact = customer.outreachActivities[0];
                  return (
                    <tr key={customer.id} className="hover:bg-soft">
                      <td className="py-3 pr-4 font-medium text-ink">{customer.companyName}</td>
                      <td className="py-3 pr-4 text-ink/80">{customer.name}</td>
                      <td className="py-3 pr-4 text-ink/80">{customer.phone || "-"}</td>
                      <td className="py-3 pr-4">
                        {latestContact ? (
                          <span className="font-medium text-ink">{formatDate(latestContact.contactDate)}</span>
                        ) : (
                          <span className="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-strong">
                            Never contacted
                          </span>
                        )}
                      </td>
                      <td className="max-w-sm py-3 pr-4 text-ink/80">{latestContact?.notes || "-"}</td>
                      <td className="py-3">
                        <TableActionGroup>
                        <TableActionLink
                          href={`/customer-outreach?customerId=${customer.id}#record-outreach`}
                          label="Record customer contact"
                        >
                          <PhoneCall aria-hidden="true" />
                        </TableActionLink>
                        </TableActionGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={customerPage.hasNext}
          label="customers"
          nextCursor={customerPage.nextCursor}
          pathname="/customer-outreach"
          searchParams={params}
          state={pagination}
          preserveParams={["q"]}
        />
      </section>
    </>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
