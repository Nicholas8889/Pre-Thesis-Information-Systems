import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCustomerInquiryPrices, updateCustomerInquiryStatus } from "@/lib/actions";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  canConvertCustomerInquiryItems,
  formatCustomerInquiryStatus
} from "@/lib/customer-inquiry";
import { requireCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import { getSearchMessage } from "@/lib/workflow";
import { canRole } from "@/lib/role-access";

export default async function CustomerInquiryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ inquiryId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { inquiryId } = await params;
  const { success, error } = getSearchMessage((await searchParams) ?? {});
  const currentUser = await requireCurrentUser();
  const canManageInquiry = canRole(currentUser.role, "MANAGE_CUSTOMER_INQUIRY");
  const portfolio = buildPortfolioScope(currentUser);
  const inquiry = await prisma.customerInquiry.findFirst({
    where: { id: inquiryId, ...portfolio.inquiryWhere },
    include: {
      customer: true,
      items: { include: { product: true } },
      salesOrder: true
    }
  });
  if (!inquiry) notFound();

  const canConvert =
    canManageInquiry && canRole(currentUser.role, "CREATE_SALES_ORDER") &&
    inquiry.status === "Open" && !inquiry.salesOrderId && canConvertCustomerInquiryItems(inquiry.items);

  return (
    <>
      <PageHeader
        title={inquiry.inquiryNumber}
        description={`${inquiry.customer.companyName} - received ${formatDate(inquiry.inquiryDate)}`}
      />
      <FlashMessage success={success} error={error} />
      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inquiry Detail</h2>
          <StatusBadge status={formatCustomerInquiryStatus(inquiry.status)} />
        </div>

        <div className="mb-5 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-ink/70">Needed By</p>
            <p className="font-medium">
              {inquiry.neededBy ? formatDate(inquiry.neededBy) : "-"}
            </p>
          </div>
          <div>
            <p className="text-ink/70">Notes</p>
            <p className="font-medium">{inquiry.notes || "-"}</p>
          </div>
          <div>
            <p className="text-ink/70">Status Note</p>
            <p className="font-medium">{inquiry.statusNote || "-"}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
              <tr>
                <th className="py-3 pr-4">Item</th>
                <th className="py-3 pr-4 text-right">Qty</th>
                <th className="py-3 pr-4 text-right">Requested Unit Price</th>
                <th className="py-3 text-right">Agreed Unit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inquiry.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4">{item.itemName}</td>
                  <td className="py-3 pr-4 text-right">{item.quantity}</td>
                  <td className="py-3 pr-4 text-right">
                    {item.requestedUnitPrice === null
                      ? "-"
                      : formatCurrency(item.requestedUnitPrice)}
                  </td>
                  <td className="py-3 text-right">
                    {item.agreedUnitPrice === null
                      ? "-"
                      : formatCurrency(item.agreedUnitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManageInquiry && inquiry.status === "Open" && !inquiry.salesOrderId && (
          <form action={updateCustomerInquiryPrices} className="mt-6 space-y-4 rounded-md border border-line bg-soft p-4">
            <h3 className="text-base font-semibold">Update Agreed Prices</h3>
            <p className="text-sm text-ink/80">Enter the prices agreed with the customer before converting this inquiry. Requested prices and production costs are not agreements.</p>
            <input type="hidden" name="inquiryId" value={inquiry.id} />
            <input type="hidden" name="expectedUpdatedAt" value={inquiry.updatedAt.toISOString()} />
            <div className="grid gap-4 md:grid-cols-2">
              {inquiry.items.map(item => (
                <label key={item.id} className="text-sm font-medium">
                  Agreed Unit Price — {item.itemName}
                  <input type="hidden" name="itemId" value={item.id} />
                  <input name="agreedUnitPrice" type="number" min={1} step={1} defaultValue={item.agreedUnitPrice ?? ""}
                    className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2" />
                </label>
              ))}
            </div>
            <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Save Agreed Prices</button>
          </form>
        )}
        <div className="mt-6 space-y-4 border-t border-line pt-5">
          {canConvert && (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/sales-orders?mode=create&inquiryId=${inquiry.id}`}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                Convert to Sales Order
              </Link>
              <Link
                href={`/customer-purchase-orders?mode=create&inquiryId=${inquiry.id}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand"
              >
                Convert to Customer PO
              </Link>
            </div>
          )}
          {canManageInquiry && inquiry.status === "Open" && (
            <div className="grid gap-3 lg:grid-cols-2">
              <StatusForm
                inquiryId={inquiry.id}
                status="Closed"
                label="Close Inquiry"
                placeholder="Reason: price agreement or required date could not be met"
              />
              <StatusForm
                inquiryId={inquiry.id}
                status="Cancelled"
                label="Cancel Inquiry"
                placeholder="Cancellation reason"
              />
            </div>
          )}
          {inquiry.salesOrder && (
            <Link
              href={`/sales-orders/${inquiry.salesOrder.id}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand"
            >
              View Linked Order
            </Link>
          )}
        </div>
        {canManageInquiry && !canConvert && inquiry.status === "Open" && !inquiry.salesOrderId && (
          <p className="mt-4 rounded-md bg-warning px-3 py-2 text-sm text-strong">
            To convert, link every item to an active product and enter an agreed unit price.
          </p>
        )}
      </section>
    </>
  );
}

function StatusForm({
  inquiryId,
  status,
  label,
  placeholder
}: {
  inquiryId: string;
  status: "Closed" | "Cancelled";
  label: string;
  placeholder: string;
}) {
  return (
    <form
      action={updateCustomerInquiryStatus}
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <input type="hidden" name="status" value={status} />
      <input
        required
        name="statusNote"
        placeholder={placeholder}
        className="h-10 min-w-0 rounded-md border border-line px-3 text-sm"
      />
      <button
        className={
          status === "Cancelled"
            ? "h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white"
            : "h-10 rounded-md border border-line px-4 text-sm font-semibold text-ink"
        }
      >
        {label}
      </button>
    </form>
  );
}
