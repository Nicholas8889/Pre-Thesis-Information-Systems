import Link from "next/link";
import { ArrowRight, Eye, Pencil, Plus, Search, ShieldCheck, Tags } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createCustomer, updateCustomer } from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { getPaymentTermLabel } from "@/lib/calculations";
import {
  getCustomerCategory,
  getCustomerPaymentRisk,
  type CustomerCategory,
  type CustomerPaymentRisk
} from "@/lib/customer-intelligence";
import { formatCurrency, formatDate } from "@/lib/format";
import { getSearchMessage } from "@/lib/workflow";

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

  const customers = await prisma.customer.findMany({
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
    orderBy: { createdAt: "desc" },
    include: {
      salesOrders: {
        select: { orderDate: true }
      },
      invoices: {
        select: {
          dueDate: true,
          remainingAmount: true,
          status: true,
          payments: { select: { paymentDate: true } }
        }
      }
    }
  });

  const selectedCustomer = viewId
    ? await prisma.customer.findUnique({
        where: { id: viewId },
        include: {
          salesOrders: {
            orderBy: { orderDate: "desc" },
            include: {
              invoice: true,
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
            orderBy: { createdAt: "desc" },
            include: {
              payments: { select: { paymentDate: true } }
            }
          }
        }
      })
    : null;

  const customerToEdit = editId
    ? await prisma.customer.findUnique({ where: { id: editId } })
    : null;
  const selectedCategory = selectedCustomer
    ? getCustomerCategory(selectedCustomer)
    : null;
  const selectedPaymentRisk = selectedCustomer
    ? getCustomerPaymentRisk(selectedCustomer)
    : null;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage customer master data used across the revenue cycle."
        action={
          <Link
            href="/customers?mode=add"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add Customer
          </Link>
        }
      />

      <FlashMessage success={success} error={error} />

      {(mode === "add" || customerToEdit) && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">
            {customerToEdit ? "Edit Customer" : "Add Customer"}
          </h2>
          <CustomerForm customer={customerToEdit} />
        </section>
      )}

      {selectedCustomer && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedCustomer.companyName}</h2>
              <p className="mt-1 text-sm text-slate-600">{selectedCustomer.name}</p>
            </div>
            <StatusBadge status={selectedCustomer.status} />
          </div>
          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Phone" value={selectedCustomer.phone} />
            <Detail label="Email" value={selectedCustomer.email} />
            <Detail label="Type" value={selectedCustomer.customerType} />
            <Detail label="Address" value={selectedCustomer.address} />
          </div>
          {selectedCustomer.notes && (
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              {selectedCustomer.notes}
            </p>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <CustomerIntelligenceCard
              title="Customer Category"
              value={selectedCategory?.category ?? "Occasional"}
              description={`${selectedCategory?.transactionCount ?? 0} order(s) in the last 3 months · Recommended markup ${selectedCategory?.markup ?? "10–15%"}`}
              icon={Tags}
              tone="category"
            />
            <CustomerIntelligenceCard
              title="Customer Payment Risk"
              value={selectedPaymentRisk ?? "Clean"}
              description={getPaymentRiskDescription(selectedPaymentRisk ?? "Clean")}
              icon={ShieldCheck}
              tone="risk"
            />
          </div>

          <section className="mt-5 border-t border-line pt-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-ink">Customer Transactions</h3>
              <p className="mt-1 text-sm text-slate-500">
                Every Sales Order and its connected Invoice and Surat Jalan.
              </p>
            </div>
            {selectedCustomer.salesOrders.length === 0 ? (
              <EmptyState message="This customer has no transactions yet." />
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Order Number</th>
                      <th className="py-3 pr-4">Order Date</th>
                      <th className="py-3 pr-4">Payment Term</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Invoice</th>
                      <th className="py-3 pr-4">Surat Jalan</th>
                      <th className="py-3 pr-4 text-right">Total</th>
                      <th className="py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {selectedCustomer.salesOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4 font-medium">{order.orderNumber}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatDate(order.orderDate)}</td>
                        <td className="py-3 pr-4 text-slate-600">{getPaymentTermLabel(order)}</td>
                        <td className="py-3 pr-4"><StatusBadge status={order.status} /></td>
                        <td className="py-3 pr-4 text-slate-600">
                          {order.invoice ? (
                            <span>
                              <span className="block font-medium text-ink">{order.invoice.invoiceNumber}</span>
                              <span className="mt-1 block text-xs">{order.invoice.status}</span>
                            </span>
                          ) : "-"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {order.deliveryNotes.length > 0
                            ? order.deliveryNotes.map((note) => `${note.deliveryNoteNumber} (${note.status})`).join(", ")
                            : "-"}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium">{formatCurrency(order.total)}</td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/sales-orders/${order.id}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand"
                          >
                            View
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                          </Link>
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

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        <form className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-line bg-white px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
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
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Phone</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Customer Category</th>
                  <th className="py-3 pr-4">Payment Risk</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {customers.map((customer) => {
                  const category = getCustomerCategory(customer);
                  const paymentRisk = getCustomerPaymentRisk(customer);
                  return <tr key={customer.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{customer.name}</td>
                    <td className="py-3 pr-4 text-slate-600">{customer.companyName}</td>
                    <td className="py-3 pr-4 text-slate-600">{customer.phone}</td>
                    <td className="py-3 pr-4 text-slate-600">{customer.customerType}</td>
                    <td className="py-3 pr-4"><CustomerCategoryBadge category={category.category} /></td>
                    <td className="py-3 pr-4"><PaymentRiskBadge risk={paymentRisk} /></td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={customer.status} />
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/customers?view=${customer.id}`}
                          title="View customer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/customers?edit=${customer.id}`}
                          title="Edit customer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
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
  tone: "category" | "risk";
}) {
  const iconStyle =
    tone === "category"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-emerald-50 text-emerald-700 ring-emerald-200";

  return (
    <article className="rounded-md border border-line bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${iconStyle}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>
    </article>
  );
}

function CustomerCategoryBadge({ category }: { category: CustomerCategory }) {
  const style = {
    New: "bg-sky-50 text-sky-700 ring-sky-200",
    Loyal: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Normal: "bg-blue-50 text-blue-700 ring-blue-200",
    Occasional: "bg-amber-50 text-amber-800 ring-amber-200"
  }[category];

  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>{category}</span>;
}

function PaymentRiskBadge({ risk }: { risk: CustomerPaymentRisk }) {
  const style = {
    "Late Payment": "bg-rose-50 text-rose-700 ring-rose-200",
    "Historically Late": "bg-amber-50 text-amber-800 ring-amber-200",
    Clean: "bg-emerald-50 text-emerald-700 ring-emerald-200"
  }[risk];

  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>{risk}</span>;
}

function getPaymentRiskDescription(risk: CustomerPaymentRisk) {
  if (risk === "Late Payment") return "This customer currently has an overdue outstanding balance.";
  if (risk === "Historically Late") return "This customer has previously paid an Invoice after its due date.";
  return "No current or recorded historical late payment was found.";
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
        <FormField label="Customer Name" name="name" defaultValue={customer?.name} required />
        <FormField
          label="Company Name"
          name="companyName"
          defaultValue={customer?.companyName}
          required
        />
        <FormField label="Phone" name="phone" defaultValue={customer?.phone} />
        <FormField label="Email" name="email" type="email" defaultValue={customer?.email} />
        <FormField label="Address" name="address" defaultValue={customer?.address} />
        <FormField
          label="Customer Type"
          name="customerType"
          defaultValue={customer?.customerType ?? "Retail"}
        />
        <label className="text-sm font-medium text-slate-700">
          Status
          <select name="status" defaultValue={customer?.status ?? "Active"} className={`${inputClass} mt-1`}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
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
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-600"
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
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        className={`${inputClass} mt-1`}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
