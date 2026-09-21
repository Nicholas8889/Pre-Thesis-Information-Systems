import { linkedDeliveryNotes } from "@/lib/delivery-note-links";
import Link from "next/link";
import {
  CreditCard,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
  UserCheck,
  UserX
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createCustomer, updateCustomer, updateCustomerStatus } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { CustomerExportDialog } from "@/components/customer-export-dialog";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { prisma } from "@/lib/prisma";
import { customerInvoiceBalanceSelect } from "@/lib/customer-payment-query";
import { getPaymentTermLabel } from "@/lib/calculations";
import {
  getCustomerPaymentBehaviour,
  getCustomerPaymentSummary,
  isOutstandingInvoice
} from "@/lib/customer-intelligence";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatNpwp } from "@/lib/npwp";
import { getEffectiveInvoiceStatus } from "@/lib/invoice-status";
import { getDeliveryNoteStatusLabel } from "@/lib/delivery-note-status";
import { getSearchMessage } from "@/lib/workflow";
import { getOppositeCustomerStatus } from "@/lib/customer-status";
import { ServerPagination } from "@/components/server-pagination";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function CustomersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const query = getFirst(params.q);
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
  const editId = getFirst(params.edit);
  const { success, error } = getSearchMessage(params);
  const pagination = getCursorPagination(params);
  const now = new Date();

  const customerRecords = await prisma.customer.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { companyName: { contains: query } },
            { phone: { contains: query } },
            { email: { contains: query } }
          ]
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...getCursorArgs(pagination),
    include: {
      invoices: {
        where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
        select: customerInvoiceBalanceSelect
      }
    }
  });
  const customerPage = getCursorPage(customerRecords, pagination);
  const customers = customerPage.items;

  const selectedCustomer = viewId
    ? await prisma.customer.findUnique({
        where: { id: viewId },
        include: {
          salesOrders: {
            orderBy: { orderDate: "desc" },
            include: {
              invoice: true,
              deliverySources: { include: { deliveryNote: true } },
              deliveryNotes: {
                select: {
                  id: true,
                  deliveryNoteNumber: true,
                  status: true
                }
              }
            }
          },
          invoices: {
            orderBy: { dueDate: "asc" },
            select: {
              ...customerInvoiceBalanceSelect,
              id: true,
              invoiceNumber: true,
              dueDate: true,
              paidAmount: true,
              totalAmount: true
            }
          }
        }
      })
    : null;

  const customerToEdit = editId
    ? await prisma.customer.findUnique({ where: { id: editId } })
    : null;
  const selectedPaymentSummary = selectedCustomer
    ? getCustomerPaymentSummary(selectedCustomer)
    : null;
  const selectedPaymentBehaviour = selectedCustomer
    ? getCustomerPaymentBehaviour(selectedCustomer)
    : null;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage customer master data used across the revenue cycle."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <CustomerExportDialog initialQuery={query} />
            <Link
              href="/customers?mode=add"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add Customer
            </Link>
          </div>
        }
      />

      <FlashMessage success={success} error={error} />

      {(mode === "add" || customerToEdit) && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">
            {customerToEdit ? "Edit Customer" : "Add Customer"}
          </h2>
          <CustomerForm customer={customerToEdit} />
        </section>
      )}

      {selectedCustomer && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedCustomer.companyName}</h2>
              <p className="mt-1 text-sm text-ink/80">{selectedCustomer.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedCustomer.status} />
              <form action={updateCustomerStatus}>
                <input type="hidden" name="id" value={selectedCustomer.id} />
                <input
                  type="hidden"
                  name="status"
                  value={getOppositeCustomerStatus(selectedCustomer.status)}
                />
                <button
                  className={
                    selectedCustomer.status === "Active"
                      ? "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-soft"
                      : "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-success px-3 text-sm font-semibold text-white transition hover:bg-success/90"
                  }
                >
                  {selectedCustomer.status === "Active" ? (
                    <UserX aria-hidden="true" className="h-4 w-4" />
                  ) : (
                    <UserCheck aria-hidden="true" className="h-4 w-4" />
                  )}
                  {selectedCustomer.status === "Active"
                    ? "Make Inactive"
                    : "Make Active"}
                </button>
              </form>
            </div>
          </div>
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Phone" value={selectedCustomer.phone} />
            <Detail label="Email" value={selectedCustomer.email} />
            <Detail label="Customer Segment" value={selectedCustomer.customerSegment} />
            <Detail label="Address" value={selectedCustomer.address} />
          </div>
          {selectedCustomer.notes && (
            <p className="mt-4 whitespace-pre-wrap rounded-md bg-soft p-3 text-sm text-ink/80">
              {selectedCustomer.notes}
            </p>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CustomerIntelligenceCard
              title="Payment Status"
              value={selectedPaymentSummary?.paymentStatus ?? "Clean"}
              description={selectedPaymentSummary?.openInvoiceCount
                ? "This customer has unpaid invoices with a Diterima Surat Jalan, including amounts not yet due."
                : "No unpaid invoices with a Diterima Surat Jalan. Invoices awaiting delivery are not counted yet."}
              icon={ShieldCheck}
              tone={selectedPaymentSummary?.openInvoiceCount ? "outstanding" : "clean"}
            />
            <CustomerIntelligenceCard
              title="Outstanding Payment"
              value={formatCurrency(selectedPaymentSummary?.outstandingAmount ?? 0)}
              description={`${selectedPaymentSummary?.openInvoiceCount ?? 0} open invoice(s) with a Diterima Surat Jalan. Cancelled invoices are excluded.`}
              icon={Wallet}
              tone={selectedPaymentSummary?.openInvoiceCount ? "outstanding" : "clean"}
            />
            <CustomerIntelligenceCard
              title="Customer Payment Behaviour"
              value={selectedPaymentBehaviour?.behaviour ?? "No Payment History"}
              description={
                selectedPaymentBehaviour?.evidence ??
                "No eligible orders were found in the last 12 months."
              }
              icon={CreditCard}
              tone="behaviour"
            />
            <CustomerIntelligenceCard
              title="NPWP / Tax Profile"
              value={formatNpwp(selectedCustomer.npwp) ?? "Not provided"}
              description={
                selectedCustomer.npwp
                  ? "PPN enabled for new orders. The NPWP will be snapshotted when an order is finalized."
                  : "PPN not enabled for new orders because an NPWP has not been provided."
              }
              icon={FileText}
              tone="tax"
            />
          </div>

          {selectedPaymentSummary && selectedPaymentSummary.openInvoiceCount > 0 && (
            <section className="mt-5 border-t border-line pt-5">
              <h3 className="mb-3 text-base font-semibold text-ink">Outstanding Invoices</h3>
              <p className="mb-3 text-sm text-ink/70">Remaining balances for invoices with a Diterima Surat Jalan.</p>
              <div className="overflow-x-auto">
                <table>
                  <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                    <tr>
                      <th className="py-3 pr-4">Invoice</th>
                      <th className="py-3 pr-4">Due Date</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 text-right">Remaining Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {selectedCustomer.invoices.filter(isOutstandingInvoice).map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="py-3 pr-4">
                          <Link className="font-medium text-brand underline" href={`/invoices?view=${invoice.id}`}>
                            {invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="py-3 pr-4">{formatDate(invoice.dueDate)}</td>
                        <td className="py-3 pr-4"><StatusBadge status={getEffectiveInvoiceStatus(invoice, now)} /></td>
                        <td className="py-3 text-right font-medium">{formatCurrency(invoice.remainingAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="mt-5 border-t border-line pt-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-ink">Customer Orders</h3>
              <p className="mt-1 text-sm text-ink/70">
                Every Sales Order and its connected Invoice and Surat Jalan.
              </p>
            </div>
            {selectedCustomer.salesOrders.length === 0 ? (
              <EmptyState message="This customer has no orders yet." />
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                    <tr>
                      <th className="py-3 pr-4">Order Number</th>
                      <th className="py-3 pr-4">Order Date</th>
                      <th className="py-3 pr-4">Payment Terms</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Invoice</th>
                      <th className="py-3 pr-4">Surat Jalan</th>
                      <th className="py-3 pr-4 text-right">Total</th>
                      <th className="py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {selectedCustomer.salesOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-soft">
                        <td className="py-3 pr-4 font-medium">{order.orderNumber}</td>
                        <td className="py-3 pr-4 text-ink/80">{formatDate(order.orderDate)}</td>
                        <td className="py-3 pr-4 text-ink/80">{getPaymentTermLabel(order)}</td>
                        <td className="py-3 pr-4">
                          <StatusStack>
                            <StatusBadge status={order.status} />
                          </StatusStack>
                        </td>
                        <td className="py-3 pr-4 text-ink/80">
                          {order.invoice ? (
                            <span>
                              <span className="block font-medium text-ink">{order.invoice.invoiceNumber}</span>
                              <span className="mt-1 block text-xs">{getEffectiveInvoiceStatus(order.invoice, now)}</span>
                            </span>
                          ) : "-"}
                        </td>
                        <td className="py-3 pr-4 text-ink/80">
                          {linkedDeliveryNotes(order).length > 0
                            ? linkedDeliveryNotes(order).map((note) => `${note.deliveryNoteNumber} (${getDeliveryNoteStatusLabel(note.status)})`).join(", ")
                            : "-"}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium">{formatCurrency(order.total)}</td>
                        <td className="py-3">
                          <TableActionGroup>
                          <TableActionLink
                            href={`/sales-orders/${order.id}`}
                            label="View Sales Order"
                          >
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
          </section>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center gap-2 border-b border-line pb-4">
          <h2 className="text-lg font-semibold">Customer Records</h2>
        </div>
        <form className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 text-ink/50" />
          <input
            name="q"
            className="w-full outline-none"
            placeholder="Search customer"
            defaultValue={query}
          />
        </form>

        {customers.length === 0 ? (
          <EmptyState message="No customers found." />
        ) : (
          <div className="overflow-x-auto">
            <table data-server-paginated="true">
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">Segment</th>
                  <th className="py-3 pr-4">Payment Status</th>
                  <th className="py-3 pr-4 text-right">Outstanding Payment</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {customers.map((customer) => {
                  const paymentSummary = getCustomerPaymentSummary(customer);
                  return <tr key={customer.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{customer.name}</td>
                    <td className="py-3 pr-4 text-ink/80">{customer.companyName}</td>
                    <td className="py-3 pr-4 text-ink/80">{customer.phone}</td>
                    <td className="py-3 pr-4 text-ink/80">{customer.customerSegment}</td>
                    <td className="py-3 pr-4"><StatusBadge status={paymentSummary.paymentStatus} /></td>
                    <td className="py-3 pr-4 text-right font-medium">{formatCurrency(paymentSummary.outstandingAmount)}</td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={customer.status} />
                      </StatusStack>
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {customer.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        <TableActionLink
                          href={`/customers?view=${customer.id}`}
                          label="View customer"
                        >
                          <Eye aria-hidden="true" />
                        </TableActionLink>
                        <TableActionLink
                          href={`/customers?edit=${customer.id}`}
                          label="Edit customer"
                        >
                          <Pencil aria-hidden="true" />
                        </TableActionLink>
                      </TableActionGroup>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <ServerPagination
          hasNext={customerPage.hasNext}
          label="customers"
          nextCursor={customerPage.nextCursor}
          pathname="/customers"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}

function CustomerIntelligenceCard({
  title,
  value,
  description,
  icon: Icon,
  tone
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone: "clean" | "outstanding" | "behaviour" | "tax";
}) {
  const iconStyle = {
    clean: "bg-success text-white",
    outstanding: "bg-warning text-strong",
    behaviour: "bg-warning text-strong",
    tax: "bg-accent text-strong"
  }[tone];

  return (
    <article className="rounded-md border border-line bg-soft p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconStyle}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">{title}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
          <p className="mt-1 text-xs leading-5 text-ink/80">{description}</p>
        </div>
      </div>
    </article>
  );
}

function CustomerForm({
  customer
}: {
  customer?: Awaited<ReturnType<typeof prisma.customer.findUnique>>;
}) {
  return (
    <form action={customer ? updateCustomer : createCustomer} className="space-y-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Contact Person" name="name" defaultValue={customer?.name} required />
        <FormField
          label="Company Name"
          name="companyName"
          defaultValue={customer?.companyName}
          required
        />
        <FormField
          label="NPWP (Optional)"
          name="npwp"
          defaultValue={formatNpwp(customer?.npwp)}
          placeholder="01.234.567.8-901.234"
          helper="Used for the order tax simulation and copied to new invoices."
        />
        <FormField label="Phone" name="phone" defaultValue={customer?.phone} />
        <FormField label="Email" name="email" type="email" defaultValue={customer?.email} />
        <FormField label="Address" name="address" defaultValue={customer?.address} />
        <FormField
          label="Customer Segment"
          name="customerSegment"
          defaultValue={customer?.customerSegment ?? "Retail"}
        />
        <label className="text-sm font-medium text-ink">
          Status
          <select name="status" defaultValue={customer?.status ?? "Active"} className={`${inputClass} mt-1`}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-ink">
        Notes
        <textarea
          name="notes"
          defaultValue={customer?.notes ?? ""}
          className={`${inputClass} mt-1 min-h-24`}
        />
      </label>
      <div className="flex gap-3">
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
          {customer ? "Save Customer" : "Add Customer"}
        </button>
        <Link
          href="/customers"
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  placeholder,
  helper
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="text-sm font-medium text-ink">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className={`${inputClass} mt-1`}
      />
      {helper && <span className="mt-1 block text-xs font-normal text-ink/70">{helper}</span>}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
