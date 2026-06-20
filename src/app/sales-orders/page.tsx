import Link from "next/link";
import { Check, Eye, FilePlus2, Plus, X } from "lucide-react";
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

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SalesOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
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

  const [customers, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, name: true }
    }),
    prisma.salesOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        invoice: true,
        items: true,
        deliveryNotes: true
      }
    })
  ]);

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
      ? await prisma.salesOrder.findUnique({
          where: { id: viewId },
          include: { customer: true, invoice: true, items: true, deliveryNotes: true }
        })
      : null;

  return (
    <>
      <PageHeader
        title="Sales Orders"
        description="Start and monitor customer sales orders before invoice, payment, and delivery."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <SalesOrderExportDialog />
            {activeTab === "ongoing" && (
              canCreateSalesOrder ? (
                <Link
                  href="/sales-orders?mode=create"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create Sales Order
                </Link>
              ) : (
                <RestrictedAction message={salesOrderRestriction}>
                  <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Create Sales Order
                  </button>
                </RestrictedAction>
              )
            )}
          </div>
        }
      />

      <FlashMessage success={success} error={error} />

      <ProcessTabs
        basePath="/sales-orders"
        activeTab={activeTab}
        ongoingCount={ongoingSalesOrders.length}
        doneCount={doneSalesOrders.length}
        approvalCount={canViewApprovals ? approvalSalesOrders.length : undefined}
      />

      {activeTab === "ongoing" && mode === "create" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">Create Sales Order</h2>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            Start from Sales Order, then the system generates invoice and connects
            payment, delivery note, receivable, and billing. Orders created by Sales
            for customers with late-payment risk are submitted to a Manager first.
          </p>
          {customers.length === 0 ? (
            <EmptyState message="Add an active customer before creating a sales order." />
          ) : (
            <SalesOrderForm
              customers={customers}
              action={createSalesOrder}
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
          </div>

          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
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
              Sales Order Total: {formatCurrency(selectedOrder.total)}
            </p>
            {activeTab === "approval" ? (
              currentUser?.role === "MANAGER" ? (
                <form action={decideSalesOrderApproval} className="flex flex-1 flex-wrap items-center justify-end gap-2">
                  <input type="hidden" name="salesOrderId" value={selectedOrder.id} />
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
              href={`/sales-orders/${selectedOrder.id}`}
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
                ? "No completed sales orders."
                : activeTab === "approval"
                  ? "No sales orders need Manager approval."
                : "No ongoing sales orders."
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
                  <th className="py-3 pr-4">Payment Term</th>
                  <th className="py-3 pr-4">Status</th>
                  {activeTab === "approval" && <th className="py-3 pr-4">Payment Risk</th>}
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Surat Jalan</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleSalesOrders.map((order) => (
                  <tr key={order.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">{order.orderNumber}</td>
                    <td className="py-3 pr-4 text-slate-600">{order.customer.companyName}</td>
                    <td className="py-3 pr-4 text-slate-600">{formatDate(order.orderDate)}</td>
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
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={
                            activeTab === "approval"
                              ? `/sales-orders?tab=approval&view=${order.id}`
                              : `/sales-orders/${order.id}`
                          }
                          title="View full sales order detail"
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
