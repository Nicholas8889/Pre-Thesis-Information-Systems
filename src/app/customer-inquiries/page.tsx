import Link from "next/link";
import { Eye, Plus } from "lucide-react";
import { createCustomerInquiry } from "@/lib/actions";
import { CustomerInquiryForm } from "@/components/customer-inquiry-form";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import { TableActionGroup, TableActionLink } from "@/components/table-actions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { formatCustomerInquiryStatus } from "@/lib/customer-inquiry";
import { getSearchMessage } from "@/lib/workflow";
import { ServerPagination } from "@/components/server-pagination";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination
} from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerInquiriesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const { success, error } = getSearchMessage(params);
  const pagination = getCursorPagination(params);
  const [customers, products, inquiryRecords] = await Promise.all([
    mode === "create" ? prisma.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, name: true }
    }) : Promise.resolve([]),
    mode === "create" ? prisma.product.findMany({
      where: { status: "Active" },
      orderBy: { productName: "asc" },
      select: { id: true, productName: true, listPrice: true }
    }) : Promise.resolve([]),
    prisma.customerInquiry.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...getCursorArgs(pagination),
      include: { customer: true, items: true, salesOrder: true }
    })
  ]);
  const inquiryPage = getCursorPage(inquiryRecords, pagination);
  const inquiries = inquiryPage.items;

  return (
    <>
      <PageHeader
        title="Customer Inquiry"
        description="Record customer product requests, negotiate terms, and convert approved requests into Sales Orders or Customer Purchase Orders."
        action={
          <Link
            href="/customer-inquiries?mode=create"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add Inquiry
          </Link>
        }
      />
      <FlashMessage success={success} error={error} />

      {mode === "create" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">Create Customer Inquiry</h2>
          <CustomerInquiryForm
            customers={customers}
            products={products}
            action={createCustomerInquiry}
          />
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Customer Inquiry Records</h2>
        <div className="overflow-x-auto">
          <table data-server-paginated="true">
            <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
              <tr>
                <th className="py-3 pr-4">Inquiry ID</th>
                <th className="py-3 pr-4">Customer</th>
                <th className="py-3 pr-4">Items</th>
                <th className="py-3 pr-4">Needed By</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Linked Order</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-sm">
              {inquiries.map((inquiry) => (
                <tr key={inquiry.id} className="transition hover:bg-soft">
                  <td className="py-3 pr-4 font-medium">{inquiry.inquiryNumber}</td>
                  <td className="py-3 pr-4">{inquiry.customer.companyName}</td>
                  <td className="py-3 pr-4">
                    {inquiry.items.map((item) => `${item.itemName} (${item.quantity})`).join(", ")}
                  </td>
                  <td className="py-3 pr-4">
                    {inquiry.neededBy ? formatDate(inquiry.neededBy) : "-"}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusStack>
                      <StatusBadge status={formatCustomerInquiryStatus(inquiry.status)} />
                    </StatusStack>
                  </td>
                  <td className="py-3 pr-4">{inquiry.salesOrder?.orderNumber ?? "-"}</td>
                  <td className="py-3">
                    <TableActionGroup>
                      <TableActionLink
                        href={`/customer-inquiries/${inquiry.id}`}
                        label="View inquiry detail"
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
        <ServerPagination
          hasNext={inquiryPage.hasNext}
          label="customer inquiries"
          nextCursor={inquiryPage.nextCursor}
          pathname="/customer-inquiries"
          searchParams={params}
          state={pagination}
        />
      </section>
    </>
  );
}
