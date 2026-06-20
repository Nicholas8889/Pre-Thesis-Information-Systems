"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserRoundSearch } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CustomerInsightRow } from "@/lib/customer-intelligence";

export type OverdueCustomerRow = {
  id: string;
  companyName: string;
  contactName: string;
  overdueInvoiceCount: number;
  overdueAmount: number;
  oldestDueDate: string;
};

export function SalesCustomerInsights({
  customers,
  overdueCustomers,
  compact = false
}: {
  customers: CustomerInsightRow[];
  overdueCustomers: OverdueCustomerRow[];
  compact?: boolean;
}) {
  const [overdueSearch, setOverdueSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const visibleOverdueCustomers = useMemo(
    () => overdueCustomers.filter((customer) => matchesSearch(customer, overdueSearch)),
    [overdueCustomers, overdueSearch]
  );
  const visibleCustomers = useMemo(
    () => customers.filter((customer) => matchesSearch(customer, customerSearch)),
    [customers, customerSearch]
  );

  return (
    <section className="mt-5 space-y-4">
      <section className="rounded-md border border-line bg-white shadow-soft">
        <SectionHeading
          title="Customers with Overdue Payment"
          description="Find customers who need collection attention and review their overdue exposure."
          value={`${overdueCustomers.length} customer(s)`}
        />
        <div className="border-b border-line px-5 py-4">
          <SearchField
            value={overdueSearch}
            onChange={setOverdueSearch}
            placeholder="Search overdue customer or contact"
            label="Search overdue customers"
          />
        </div>
        {visibleOverdueCustomers.length === 0 ? (
          <EmptyTableMessage
            message={overdueCustomers.length === 0 ? "No customers have overdue payments." : "No overdue customer matches your search."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3 text-right">Overdue Invoices</th>
                  <th className="px-5 py-3 text-right">Overdue Amount</th>
                  <th className="px-5 py-3">Oldest Due Date</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleOverdueCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-ink">{customer.companyName}</td>
                    <td className="px-5 py-3.5 text-slate-600">{customer.contactName}</td>
                    <td className="px-5 py-3.5 text-right">{customer.overdueInvoiceCount}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-rose-700">
                      {formatCurrency(customer.overdueAmount)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(new Date(customer.oldestDueDate))}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/receivables?tab=ongoing&status=Overdue`}
                        className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-brand"
                      >
                        View receivables
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-line bg-white shadow-soft">
        <SectionHeading
          title="Customer Category & Price Markup"
          description="Customer value classification based on average monthly Sales Order activity over the last three months."
          value={`${customers.length} customer(s)`}
        />
        <div className="border-b border-line px-5 py-4">
          <SearchField
            value={customerSearch}
            onChange={setCustomerSearch}
            placeholder="Search customer, contact, type, or category"
            label="Search customer categories"
          />
        </div>
        {visibleCustomers.length === 0 ? (
          <EmptyTableMessage message="No customer matches your search." />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  {!compact && <th className="px-5 py-3">Customer Type</th>}
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">3-Month Orders</th>
                  <th className="px-5 py-3 text-right">Monthly Rate</th>
                  <th className="px-5 py-3 text-right">Recommended Markup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-ink">{customer.companyName}</p>
                      <p className="mt-1 text-xs text-slate-500">{customer.contactName}</p>
                    </td>
                    {!compact && <td className="px-5 py-3.5 text-slate-600">{customer.customerType}</td>}
                    <td className="px-5 py-3.5"><CategoryBadge category={customer.category} /></td>
                    <td className="px-5 py-3.5 text-right">{customer.transactionCount}</td>
                    <td className="px-5 py-3.5 text-right">{customer.monthlyOrderRate.toFixed(1)}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-brand">{customer.markup}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-slate-50 px-5 py-3 text-xs text-slate-600">
          Markup guide: Normal 5% · Occasional 10–15% · Loyal 0% · New 0%.
        </div>
      </section>
    </section>
  );
}

function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <label className="relative block max-w-xl">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-brand"
      />
    </label>
  );
}

function SectionHeading({ title, description, value }: { title: string; description: string; value: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRoundSearch className="h-5 w-5 text-brand" />{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{value}</span>
    </div>
  );
}

function CategoryBadge({ category }: { category: CustomerInsightRow["category"] }) {
  const style = {
    New: "bg-sky-50 text-sky-700 ring-sky-200",
    Loyal: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Normal: "bg-blue-50 text-blue-700 ring-blue-200",
    Occasional: "bg-amber-50 text-amber-800 ring-amber-200"
  }[category];
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>{category}</span>;
}

function EmptyTableMessage({ message }: { message: string }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{message}</div>;
}

function matchesSearch(customer: { companyName: string; contactName: string; [key: string]: unknown }, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return Object.values(customer).some((value) => String(value).toLowerCase().includes(query));
}
