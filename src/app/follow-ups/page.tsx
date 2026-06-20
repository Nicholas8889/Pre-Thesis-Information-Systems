import Link from "next/link";
import { createFollowUp, recordCustomerProductFollowUp } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { isDoneFollowUp, isOngoingFollowUp } from "@/lib/process-status";
import { getSearchMessage, syncOverdueInvoices, toDateInputValue } from "@/lib/workflow";
import { Eye, PhoneCall, Search } from "lucide-react";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export async function BillingPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCustomerId = getFirst(params.customerId);
  const selectedInvoiceId = getFirst(params.invoiceId);
  const activeTab = normalizeProcessTab(params.tab);
  const { success, error } = getSearchMessage(params);

  await syncOverdueInvoices();

  const [customers, openInvoices, followUps] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" }
    }),
    prisma.invoice.findMany({
      where: {
        remainingAmount: { gt: 0 },
        status: { in: ["Unpaid", "Partial", "Overdue"] }
      },
      include: { customer: true },
      orderBy: { dueDate: "asc" }
    }),
    prisma.followUp.findMany({
      orderBy: { followUpDate: "asc" },
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
    })
  ]);

  const selectedInvoice = openInvoices.find((invoice) => invoice.id === selectedInvoiceId);
  const ongoingFollowUps = followUps.filter((followUp) => isOngoingFollowUp(followUp.status));
  const doneFollowUps = followUps.filter((followUp) => isDoneFollowUp(followUp.status));
  const visibleFollowUps = activeTab === "done" ? doneFollowUps : ongoingFollowUps;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Track planned and completed customer billing and collection activities."
      />

      <FlashMessage success={success} error={error} />

      <ProcessTabs
        basePath="/billing"
        activeTab={activeTab}
        ongoingCount={ongoingFollowUps.length}
        doneCount={doneFollowUps.length}
      />

      {activeTab === "ongoing" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">Add Billing Record</h2>
          {customers.length === 0 ? (
            <EmptyState message="Add an active customer before creating a billing record." />
          ) : (
            <form action={createFollowUp} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-medium text-slate-700">
                Customer
                <select
                  name="customerId"
                  required
                  defaultValue={selectedCustomerId ?? selectedInvoice?.customerId ?? ""}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName} - {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Invoice
                <select
                  name="invoiceId"
                  defaultValue={selectedInvoiceId ?? ""}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">No invoice link</option>
                  {openInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoiceNumber} - {invoice.customer.companyName} -{" "}
                      {formatCurrency(invoice.remainingAmount)} remaining
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                Billing Date
                <input
                  name="followUpDate"
                  type="date"
                  defaultValue={toDateInputValue()}
                  required
                  className={`${inputClass} mt-1`}
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Status
                <select name="status" defaultValue="Planned" className={`${inputClass} mt-1`}>
                  <option value="Planned">Planned</option>
                  <option value="Done">Done</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700 xl:col-span-3">
                Notes
                <input
                  name="notes"
                  required
                  defaultValue={
                    selectedInvoice
                      ? `Follow up remaining payment ${formatCurrency(
                          selectedInvoice.remainingAmount
                        )} for ${selectedInvoice.invoiceNumber}`
                      : ""
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>

              <div className="flex items-end">
                <button className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
                  Add Billing Record
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-lg font-semibold">Billing List</h2>
        {visibleFollowUps.length === 0 ? (
          <EmptyState
            message={
              activeTab === "done"
                ? "No completed billing records."
                : "No ongoing billing records."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Sales Order</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleFollowUps.map((followUp) => (
                  <tr key={followUp.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">
                      {followUp.customer.companyName}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {followUp.invoice?.invoiceNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {followUp.invoice?.salesOrder.orderNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(followUp.followUpDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={followUp.status} />
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{followUp.notes}</td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        {followUp.invoice ? (
                          <Link
                            href={`/sales-orders/${followUp.invoice.salesOrderId}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                          >
                            <Eye aria-hidden="true" className="h-4 w-4" />
                            View Sales Order
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-500">Customer only</span>
                        )}
                      </div>
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

export default async function CustomerFollowUpsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedCustomerId = getFirst(params.customerId);
  const query = getFirst(params.q);
  const { success, error } = getSearchMessage(params);

  const [allCustomers, customers] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, name: true }
    }),
    prisma.customer.findMany({
      where: query
        ? {
            OR: [
              { companyName: { contains: query } },
              { name: { contains: query } },
              { phone: { contains: query } }
            ]
          }
        : undefined,
      orderBy: { companyName: "asc" },
      include: {
        productFollowUps: {
          orderBy: [{ contactDate: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      }
    })
  ]);

  return (
    <>
      <PageHeader
        title="Follow Up"
        description="Track the last time each customer was contacted to share information about new products."
      />

      <FlashMessage success={success} error={error} />

      <section id="record-follow-up" className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Record Customer Contact</h2>
          <p className="mt-1 text-sm text-slate-600">
            Save when the customer was contacted. A note about the product or conversation is optional.
          </p>
        </div>

        {allCustomers.length === 0 ? (
          <EmptyState message="Add a customer before recording a follow-up." />
        ) : (
          <form
            key={selectedCustomerId ?? "no-customer-selected"}
            action={recordCustomerProductFollowUp}
            className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_1.6fr_auto]"
          >
            <label className="text-sm font-medium text-slate-700">
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

            <label className="text-sm font-medium text-slate-700">
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

            <label className="text-sm font-medium text-slate-700">
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

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Customer Follow Up List</h2>
            <p className="mt-1 text-sm text-slate-500">All customers and their latest product-information contact.</p>
          </div>
          <form className="flex w-full max-w-sm items-center gap-2 rounded-md border border-line px-3 py-2">
            <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
            <input name="q" defaultValue={query} placeholder="Search customer" className="w-full text-sm outline-none" />
          </form>
        </div>

        {customers.length === 0 ? (
          <EmptyState message="No customers match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Contact Person</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">Last Contact</th>
                  <th className="py-3 pr-4">Last Note</th>
                  <th className="py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {customers.map((customer) => {
                  const latestContact = customer.productFollowUps[0];
                  return (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-medium text-ink">{customer.companyName}</td>
                      <td className="py-3 pr-4 text-slate-600">{customer.name}</td>
                      <td className="py-3 pr-4 text-slate-600">{customer.phone || "-"}</td>
                      <td className="py-3 pr-4">
                        {latestContact ? (
                          <span className="font-medium text-ink">{formatDate(latestContact.contactDate)}</span>
                        ) : (
                          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                            Never contacted
                          </span>
                        )}
                      </td>
                      <td className="max-w-sm py-3 pr-4 text-slate-600">{latestContact?.notes || "-"}</td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/follow-ups?customerId=${customer.id}#record-follow-up`}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                        >
                          <PhoneCall aria-hidden="true" className="h-4 w-4" />
                          Record Contact
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
