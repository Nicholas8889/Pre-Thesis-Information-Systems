import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { createCustomerInquiry } from "@/lib/actions";
import { CustomerInquiryForm } from "@/components/customer-inquiry-form";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { formatCustomerInquiryStatus } from "@/lib/customer-inquiry";
import { getSearchMessage } from "@/lib/workflow";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerInquiriesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {};
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const { success, error } = getSearchMessage(params);
  const [customers, products, inquiries] = await Promise.all([
    prisma.customer.findMany({ where: { status: "Active" }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true, name: true } }),
    prisma.product.findMany({ where: { status: "Active" }, orderBy: { productName: "asc" }, select: { id: true, productName: true, basePrice: true } }),
    prisma.customerInquiry.findMany({ orderBy: { createdAt: "desc" }, include: { customer: true, items: true, salesOrder: true } })
  ]);
  return <>
    <PageHeader title="Customer Inquiry" description="Record customer product requests, negotiate terms, and convert approved requests into Sales Orders or Pre Orders." action={<Link href="/customer-inquiries?mode=create" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add Inquiry</Link>} />
    <FlashMessage success={success} error={error} />
    {mode === "create" && <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft"><h2 className="mb-4 text-lg font-semibold">Create Customer Inquiry</h2><CustomerInquiryForm customers={customers} products={products} action={createCustomerInquiry} /></section>}
    <section className="rounded-md border border-line bg-white p-5 shadow-soft"><h2 className="mb-4 text-lg font-semibold">Customer Inquiry Records</h2><div className="overflow-x-auto"><table><thead className="border-b border-line text-left text-xs uppercase text-slate-500"><tr><th className="py-3 pr-4">Inquiry ID</th><th className="py-3 pr-4">Customer</th><th className="py-3 pr-4">Items</th><th className="py-3 pr-4">Needed By</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Linked Order</th><th className="py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-line text-sm">{inquiries.map((inquiry) => <tr key={inquiry.id}><td className="py-3 pr-4 font-medium">{inquiry.inquiryNumber}</td><td className="py-3 pr-4">{inquiry.customer.companyName}</td><td className="py-3 pr-4">{inquiry.items.map((item) => `${item.itemName} (${item.quantity})`).join(", ")}</td><td className="py-3 pr-4">{inquiry.neededBy ? formatDate(inquiry.neededBy) : "-"}</td><td className="py-3 pr-4"><StatusBadge status={formatCustomerInquiryStatus(inquiry.status)} /></td><td className="py-3 pr-4">{inquiry.salesOrder?.orderNumber ?? "-"}</td><td className="py-3 text-right"><Link href={`/customer-inquiries/${inquiry.id}`} title="View inquiry detail" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"><Eye aria-hidden="true" className="h-4 w-4" /><span className="sr-only">View inquiry detail</span></Link></td></tr>)}</tbody></table></div></section>
  </>;
}
