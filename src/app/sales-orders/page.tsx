import Link from "next/link";
import { Check, ClipboardList, Eye, FilePlus2, FileText, Plus, ShoppingCart, X } from "lucide-react";
import {
  decideSalesOrderApproval,
  generateInvoice,
  createSalesOrder
} from "@/lib/actions";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { SalesOrderForm } from "@/components/sales-order-form";
import { SalesOrderExportDialog } from "@/components/sales-order-export-dialog";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import { isDoneSalesOrder, isOngoingSalesOrder } from "@/lib/process-status";
import { getSearchMessage } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import { getCustomerCategory } from "@/lib/customer-intelligence";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SalesOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return OrderTransactionsPage({ searchParams, transactionType: "SALES_ORDER" });
}

export async function OrderTransactionsPage({
  searchParams,
  transactionType
}: {
  searchParams?: Promise<SearchParams>;
  transactionType: "SALES_ORDER" | "PRE_ORDER";
}) {
  const params = (await searchParams) ?? {};
  const isPreOrder = transactionType === "PRE_ORDER";
  const basePath = isPreOrder ? "/pre-orders" : "/sales-orders";
  const singularLabel = isPreOrder ? "Pre Order" : "Sales Order";
  const pluralLabel = isPreOrder ? "Pre Orders" : "Sales Orders";
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
  const currentUser = await getCurrentUser();
  const canCreateSalesOrder = canRole(currentUser?.role, "CREATE_SALES_ORDER");
  const canCreateInvoice = canRole(currentUser?.role, "CREATE_INVOICE");
  const salesOrderRestriction = getRestrictionMessage("CREATE_SALES_ORDER");
  const invoiceRestriction = getRestrictionMessage("CREATE_INVOICE");
  const canViewApprovals = currentUser?.role === "MANAGER" || currentUser?.role === "SALES";
  const requestedTab = getFirst(params.tab);
  const activeTab =
    requestedTab === "approval" && canViewApprovals
      ? "approval"
      : normalizeProcessTab(params.tab);
  const { success, error } = getSearchMessage(params);

  const [customerRecords, products, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        name: true,
        createdAt: true,
        salesOrders: { select: { orderDate: true } }
      }
    }),
    prisma.product.findMany({
      where: { status: "Active" },
      orderBy: { productName: "asc" },
      select: { id: true, productName: true, basePrice: true }
    }),
    prisma.salesOrder.findMany({
      where: { transactionType },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        invoice: true,
        items: true,
        deliveryNotes: true
      }
    })
  ]);
  const customers = customerRecords.map((customer) => ({
    id: customer.id,
    companyName: customer.companyName,
    name: customer.name,
    category: getCustomerCategory(customer).category
  }));

  const ongoingSalesOrders = salesOrders.filter((order) =>
    order.approvalStatus !== "Pending" &&
    isOngoingSalesOrder({
      status: order.status,
      deliveryNoteCount: order.deliveryNotes.length
    })
  );
  const approvalSalesOrders = salesOrders.filter(
    (order) => order.approvalStatus === "Pending"
  );
  const doneSalesOrders = salesOrders.filter((order) =>
    isDoneSalesOrder({
      status: order.status,
      deliveryNoteCount: order.deliveryNotes.length
    })
  );
  const visibleSalesOrders =
    activeTab === "approval"
      ? approvalSalesOrders
      : activeTab === "done"
        ? doneSalesOrders
        : ongoingSalesOrders;

  const selectedOrder =
    (activeTab === "ongoing" || activeTab === "approval") && viewId
      ? await prisma.salesOrder.findFirst({
          where: { id: viewId, transactionType },
          include: { customer: true, invoice: true, items: true, deliveryNotes: true }
        })
      : null;

  return (
    <>
      <PageHeader
        title={pluralLabel}
        description={
          isPreOrder
            ? "Monitor customer Pre Orders and their required dates before invoice, payment, and delivery."
            : "Start and monitor customer sales orders before invoice, payment, and delivery."
        }
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <SalesOrderExportDialog transactionType={transactionType} />
            {activeTab === "ongoing" && (
              canCreateSalesOrder ? (
                <Link
                  href={isPreOrder ? "/pre-orders?mode=create" : "/sales-orders?mode=choose"}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create {singularLabel}
                </Link>
              ) : (
                <RestrictedAction message={salesOrderRestriction}>
                  <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Create {singularLabel}
                  </button>
                </RestrictedAction>
              )
            )}
          </div>
        }
      />

      <FlashMessage success={success} error={error} />

      <ProcessTabs
        basePath={basePath}
        activeTab={activeTab}
        ongoingCount={ongoingSalesOrders.length}
        doneCount={doneSalesOrders.length}
        approvalCount={canViewApprovals ? approvalSalesOrders.length : undefined}
      />

      {!isPreOrder && mode === "choose" && (
        <TransactionTypeDialog />
      )}

      {activeTab === "ongoing" && mode === "create" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">Create {singularLabel}</h2>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            {isPreOrder
              ? "Record the customer PO reference, document, and product required date. Invoice, payment, delivery note, receivable, and billing continue through the same process as a normal Sales Order."
              : "Start from Sales Order, then the system generates invoice and connects payment, delivery note, receivable, and billing. Orders created by Sales for customers with late-payment risk are submitted to a Manager first."}
          </p>
          {customers.length === 0 ? (
            <EmptyState message={`Add an active customer before creating a ${singularLabel}.`} />
          ) : products.length === 0 ? (
            <EmptyState message={`Add an active product before creating a ${singularLabel}.`} />
          ) : (
            <SalesOrderForm
              customers={customers}
              products={products}
              action={createSalesOrder}
              transactionType={transactionType}
              disabled={!canCreateSalesOrder}
              restrictionMessage={salesOrderRestriction}
            />
          )}
        </section>
      )}

      {selectedOrder && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedOrder.orderNumber}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedOrder.customer.companyName} - {formatDate(selectedOrder.orderDate)}
              </p>
            </div>
            <StatusBadge status={selectedOrder.status} />
          </div>

          <div className="mb-4 grid gap-4 text-sm md:grid-cols-3">
            <Detail label="Transaction Type" value={singularLabel} />
            {isPreOrder && selectedOrder.requiredDate && (
              <Detail label="Product Required Date" value={formatDate(selectedOrder.requiredDate)} />
            )}
            {isPreOrder && (
              <Detail label="PO Document" value={selectedOrder.poDocumentName ?? "Not uploaded"} />
            )}
            {activeTab === "approval" && (
              <Detail label="Approval Risk" value={selectedOrder.approvalRisk ?? "Payment risk"} />
            )}
            <Detail
              label="Payment Term"
              value={getPaymentTermLabel({
                paymentTermType: selectedOrder.paymentTermType,
                creditTermMonths: selectedOrder.creditTermMonths
              })}
            />
            <Detail
              label="Invoice Status"
              value={selectedOrder.invoice?.status ?? "No invoice"}
            />
            <Detail
              label="Surat Jalan"
              value={
                selectedOrder.deliveryNotes.length > 0
                  ? `${selectedOrder.deliveryNotes.length} record(s)`
                  : "No Surat Jalan"
              }
            />
            <Detail label="Notes" value={selectedOrder.notes ?? "-"} />
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4 text-right">Base Price</th>
                  <th className="py-3 pr-4 text-right">Markup</th>
                  <th className="py-3 pr-4 text-right">Discount</th>
                  <th className="py-3 pr-4 text-right">Unit Price</th>
                  <th className="py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedOrder.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {formatCurrency(item.basePrice)}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {item.markupPercent ? `${item.markupPercent}%` : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {item.discountPercent ? `${item.discountPercent}%` : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right text-slate-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base font-semibold">
              {singularLabel} Total: {formatCurrency(selectedOrder.total)}
            </p>
            {activeTab === "approval" ? (
              currentUser?.role === "MANAGER" ? (
                <form action={decideSalesOrderApproval} className="flex flex-1 flex-wrap items-center justify-end gap-2">
                  <input type="hidden" name="salesOrderId" value={selectedOrder.id} />
                  <input type="hidden" name="returnPath" value={basePath} />
                  <input
                    name="decisionNote"
                    placeholder="Decision note (optional)"
                    className="h-10 min-w-52 flex-1 rounded-md border border-line px-3 text-sm outline-none focus:border-brand"
                  />
                  <button
                    name="decision"
                    value="Rejected"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    name="decision"
                    value="Approved"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    Approve
                  </button>
                </form>
              ) : (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  Waiting for Manager approval.
                </p>
              )
            ) : selectedOrder.invoice ? (
              <Link
                href={`/invoices?view=${selectedOrder.invoice.id}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-brand"
              >
                View Invoice
              </Link>
            ) : canCreateInvoice ? (
              <form action={generateInvoice}>
                <input type="hidden" name="salesOrderId" value={selectedOrder.id} />
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white">
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Confirm & Generate Invoice
                </button>
              </form>
            ) : (
              <RestrictedAction message={invoiceRestriction}>
                <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                  <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                  Confirm & Generate Invoice
                </button>
              </RestrictedAction>
            )}
            <Link
              href={`${basePath}/${selectedOrder.id}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
            >
              View Full Detail
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        {visibleSalesOrders.length === 0 ? (
          <EmptyState
            message={
              activeTab === "done"
                ? `No completed ${pluralLabel.toLowerCase()}.`
                : activeTab === "approval"
                  ? `No ${pluralLabel.toLowerCase()} need Manager approval.`
                : `No ongoing ${pluralLabel.toLowerCase()}.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Order Number</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Order Date</th>
                  {isPreOrder && <th className="py-3 pr-4">Required Date</th>}
                  {isPreOrder && <th className="py-3 pr-4">PO Document</th>}
                  <th className="py-3 pr-4">Payment Term</th>
                  <th className="py-3 pr-4">Status</th>
                  {activeTab === "approval" && <th className="py-3 pr-4">Payment Risk</th>}
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Surat Jalan</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleSalesOrders.map((order) => (
                  <tr key={order.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{order.orderNumber}</td>
                    <td className="py-3 pr-4 text-slate-600">{order.customer.companyName}</td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(order.orderDate)}</td>
                    {isPreOrder && (
                      <td className="py-3 pr-4 font-medium text-slate-700">
                        {order.requiredDate ? formatDate(order.requiredDate) : "-"}
                      </td>
                    )}
                    {isPreOrder && (
                      <td className="py-3 pr-4 text-slate-600">
                        {order.poDocumentStoredName ? (
                          <Link
                            href={`/api/pre-orders/${order.id}/document`}
                            target="_blank"
                            title="Open PO document"
                            className="inline-flex items-center gap-2 font-semibold text-brand"
                          >
                            <FileText aria-hidden="true" className="h-4 w-4" />
                            {order.poDocumentName ?? "Open document"}
                          </Link>
                        ) : "-"}
                      </td>
                    )}
                    <td className="py-3 pr-4 text-slate-600">
                      {getPaymentTermLabel({
                        paymentTermType: order.paymentTermType,
                        creditTermMonths: order.creditTermMonths
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={order.status} />
                    </td>
                    {activeTab === "approval" && (
                      <td className="py-3 pr-4">
                        <StatusBadge status={order.approvalRisk ?? "Payment risk"} />
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      {order.invoice ? <StatusBadge status={order.invoice.status} /> : "-"}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {order.deliveryNotes[0]?.status ?? "-"}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-slate-600">
                      {order.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={
                            activeTab === "approval"
                              ? `${basePath}?tab=approval&view=${order.id}`
                              : `${basePath}/${order.id}`
                          }
                          title={`View full ${singularLabel.toLowerCase()} detail`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Eye aria-hidden="true" className="h-4 w-4" />
                        </Link>
                        {activeTab === "ongoing" && !order.invoice && (
                          canCreateInvoice ? (
                            <form action={generateInvoice}>
                              <input type="hidden" name="salesOrderId" value={order.id} />
                              <button
                                title="Generate invoice"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                              >
                                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </form>
                          ) : (
                            <RestrictedAction message={invoiceRestriction}>
                              <button disabled className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-slate-50 text-slate-400">
                                <FilePlus2 aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </RestrictedAction>
                          )
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

function TransactionTypeDialog() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-type-title"
        className="w-full max-w-2xl rounded-lg border border-line bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="transaction-type-title" className="text-xl font-semibold text-ink">
              Choose Transaction Type
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Is this a normal Sales Order or a customer Pre Order (PO)?
            </p>
          </div>
          <Link
            href="/sales-orders"
            title="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-slate-500"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Link
            href="/sales-orders?mode=create"
            className="rounded-md border border-line p-5 transition hover:border-brand hover:bg-blue-50"
          >
            <ShoppingCart aria-hidden="true" className="h-7 w-7 text-brand" />
            <h3 className="mt-3 font-semibold text-ink">Normal Sales Order</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Uses an automatically generated Sales Order number.
            </p>
          </Link>
          <Link
            href="/pre-orders?mode=create"
            className="rounded-md border border-line p-5 transition hover:border-brand hover:bg-blue-50"
          >
            <ClipboardList aria-hidden="true" className="h-7 w-7 text-brand" />
            <h3 className="mt-3 font-semibold text-ink">Pre Order (PO)</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Requires a manual PO ID, product required date, and customer document upload.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}
