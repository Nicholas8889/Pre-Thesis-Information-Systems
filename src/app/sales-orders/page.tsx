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
import { StatusStack } from "@/components/status-stack";
import {
  TableActionButton,
  TableActionGroup,
  TableActionLink
} from "@/components/table-actions";
import { RestrictedAction } from "@/components/restricted-action";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import { isDoneSalesOrder, isOngoingSalesOrder } from "@/lib/process-status";
import { getSearchMessage } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";
import {
  getCustomerCategory,
  getCustomerPaymentBehaviour,
  getCustomerPaymentRisk,
  getJakartaTrailingTwelveMonthWindow
} from "@/lib/customer-intelligence";
import { formatNpwp } from "@/lib/npwp";
import {
  getCurrentMonthAverageSoldPrice,
  getJakartaCurrentMonthWindow,
  PRODUCT_AVERAGE_ELIGIBLE_STATUSES
} from "@/lib/product-insights";
import { formatPpnRate, getConfiguredPpnRateBasisPoints } from "@/lib/tax";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SalesOrdersPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  return OrdersBySourcePage({ searchParams, source: "DIRECT" });
}

export async function OrdersBySourcePage({
  searchParams,
  source
}: {
  searchParams?: Promise<SearchParams>;
  source: "DIRECT" | "CUSTOMER_PO";
}) {
  const params = (await searchParams) ?? {};
  const isCustomerPo = source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const singularLabel = isCustomerPo ? "Customer PO" : "Sales Order";
  const pluralLabel = isCustomerPo ? "Customer Purchase Orders" : "Sales Orders";
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
  const inquiryId = getFirst(params.inquiryId);
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
  const now = new Date();
  const ppnRateBasisPoints = getConfiguredPpnRateBasisPoints();
  const customerHistoryWindow = getJakartaTrailingTwelveMonthWindow(now);
  const currentMonth = getJakartaCurrentMonthWindow(now);

  const [customerRecords, productRecords, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        companyName: true,
        name: true,
        npwp: true,
        createdAt: true,
        salesOrders: {
          where: {
            orderDate: {
              gte: customerHistoryWindow.observationStart,
              lte: customerHistoryWindow.observationEnd
            }
          },
          select: {
            orderDate: true,
            status: true,
            paymentTermType: true,
            creditTermMonths: true
          }
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
    }),
    prisma.product.findMany({
      where: { status: "Active" },
      orderBy: { productName: "asc" },
      select: {
        id: true,
        productName: true,
        listPrice: true,
        salesOrderItems: {
          where: {
            salesOrder: {
              orderDate: {
                gte: currentMonth.monthStart,
                lt: currentMonth.nextMonthStart
              },
              status: { in: [...PRODUCT_AVERAGE_ELIGIBLE_STATUSES] }
            }
          },
          select: {
            productId: true,
            quantity: true,
            subtotal: true,
            salesOrder: { select: { orderDate: true, status: true } }
          }
        }
      }
    }),
    prisma.salesOrder.findMany({
      where: { source },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        invoice: true,
        items: true,
        deliveryNotes: true
      }
    })
  ]);
  const customers = customerRecords.map((customer) => {
    const category = getCustomerCategory(customer, now);
    const paymentBehaviour = getCustomerPaymentBehaviour(customer, now);

    return {
      id: customer.id,
      companyName: customer.companyName,
      name: customer.name,
      category: category.category,
      recommendedMarkup: category.markup,
      paymentRisk: getCustomerPaymentRisk(customer, now),
      paymentBehaviour: paymentBehaviour.behaviour,
      paymentBehaviourEvidence: paymentBehaviour.evidence,
      npwp: formatNpwp(customer.npwp),
      ppnApplied: Boolean(customer.npwp)
    };
  });
  const products = productRecords.map((product) => {
    const average = getCurrentMonthAverageSoldPrice(
      product.id,
      product.salesOrderItems,
      now
    );

    return {
      id: product.id,
      productName: product.productName,
      listPrice: product.listPrice,
      averageSoldPrice: average.averageSoldPrice,
      averageEligibleQuantity: average.eligibleQuantity,
      averageMonthLabel: average.monthLabel
    };
  });
  const conversionInquiry = inquiryId && mode === "create"
    ? await prisma.customerInquiry.findFirst({ where: { id: inquiryId, status: "Open" }, include: { items: true } })
    : null;
  const inquiryItems = conversionInquiry?.items.every((item) => item.productId && item.agreedUnitPrice !== null)
    ? conversionInquiry.items.map((item) => ({ productId: item.productId!, itemName: item.itemName, quantity: item.quantity, baseUnitPrice: item.agreedUnitPrice!, markupPercent: 0, discountPercent: 0 }))
    : undefined;

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
          where: { id: viewId, source },
          include: { customer: true, invoice: true, items: true, deliveryNotes: true }
        })
      : null;

  return (
    <>
      <PageHeader
        title={pluralLabel}
        description={
          isCustomerPo
            ? "Monitor Customer Purchase Orders and their required dates before invoice, payment, and delivery."
            : "Start and monitor customer sales orders before invoice, payment, and delivery."
        }
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <SalesOrderExportDialog source={source} />
            {activeTab === "ongoing" && (
              canCreateSalesOrder ? (
                <Link
                  href={isCustomerPo ? "/customer-purchase-orders?mode=create" : "/sales-orders?mode=choose"}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Create {singularLabel}
                </Link>
              ) : (
                <RestrictedAction message={salesOrderRestriction}>
                  <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink/15 px-4 text-sm font-semibold text-ink/70">
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

      {!isCustomerPo && mode === "choose" && (
        <SalesOrderSourceDialog />
      )}

      {activeTab === "ongoing" && mode === "create" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <h2 className="mb-2 text-lg font-semibold">Create {singularLabel}</h2>
          <p className="mb-4 text-sm leading-6 text-ink/80">
            {isCustomerPo
              ? "Record the customer PO document and product required date. The system generates both a Sales Order Number and Customer PO Number, then invoice, payment, delivery note, receivable, and collection work continue through the same process as a direct Sales Order."
              : "Start from a direct Sales Order, then the system generates an invoice and connects payment, delivery note, receivable, and collection work. Orders created by Sales for customers with late-payment risk are submitted to a Manager first."}
          </p>
          {customers.length === 0 ? (
            <EmptyState message={`Add an active customer before creating a ${singularLabel}.`} />
          ) : products.length === 0 ? (
            <EmptyState message={`Add an active product before creating a ${singularLabel}.`} />
          ) : (
            <SalesOrderForm
              customers={customers}
              products={products}
              ppnRateBasisPoints={ppnRateBasisPoints}
              action={createSalesOrder}
              source={source}
              inquiryId={conversionInquiry?.id}
              initialCustomerId={conversionInquiry?.customerId}
              initialItems={inquiryItems}
              disabled={!canCreateSalesOrder}
              restrictionMessage={salesOrderRestriction}
            />
          )}
        </section>
      )}

      {selectedOrder && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedOrder.orderNumber}</h2>
              <p className="mt-1 text-sm text-ink/80">
                {selectedOrder.customer.companyName} - {formatDate(selectedOrder.orderDate)}
                {isCustomerPo && selectedOrder.customerPoNumber ? ` - PO ${selectedOrder.customerPoNumber}` : ""}
              </p>
            </div>
            <StatusBadge status={selectedOrder.status} />
          </div>

          <div className="mb-4 grid gap-4 text-sm md:grid-cols-3">
            <Detail label="Order Source" value={singularLabel} />
            {isCustomerPo && (
              <Detail label="Customer PO Number" value={selectedOrder.customerPoNumber ?? "-"} />
            )}
            {isCustomerPo && selectedOrder.requiredDate && (
              <Detail label="Product Required Date" value={formatDate(selectedOrder.requiredDate)} />
            )}
            {isCustomerPo && (
              <Detail label="Customer PO Document" value={selectedOrder.customerPoDocumentName ?? "Not uploaded"} />
            )}
            {activeTab === "approval" && (
              <Detail label="Approval Risk" value={selectedOrder.approvalRisk ?? "Payment risk"} />
            )}
            <Detail
              label="Payment Terms"
              value={getPaymentTermLabel({
                paymentTermType: selectedOrder.paymentTermType,
                creditTermMonths: selectedOrder.creditTermMonths
              })}
            />
            {selectedOrder.customerNpwpSnapshot && (
              <Detail
                label="NPWP Snapshot"
                value={formatNpwp(selectedOrder.customerNpwpSnapshot) ?? "-"}
              />
            )}
            <Detail
              label="Net Sales (Margin)"
              value={formatCurrency(selectedOrder.netSalesAmount)}
            />
            {selectedOrder.ppnApplied && (
              <Detail
                label={`PPN (${formatPpnRate(selectedOrder.ppnRateBasisPoints)})`}
                value={formatCurrency(selectedOrder.ppnAmount)}
              />
            )}
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
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4 text-right">Base Unit Price</th>
                  <th className="py-3 pr-4 text-right">Markup</th>
                  <th className="py-3 pr-4 text-right">Discount</th>
                  <th className="py-3 pr-4 text-right">Final Unit Price</th>
                  <th className="py-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedOrder.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {formatCurrency(item.baseUnitPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {item.markupPercent ? `${item.markupPercent}%` : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {item.discountPercent ? `${item.discountPercent}%` : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {formatCurrency(item.finalUnitPrice)}
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
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-danger px-4 text-sm font-semibold text-white"
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
                <p className="rounded-md bg-warning px-3 py-2 text-sm font-medium text-strong">
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
                <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-ink/15 px-4 text-sm font-semibold text-ink/70">
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

      <section className="rounded-md border border-line bg-white p-5 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">{singularLabel} Records</h2>
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
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">Order Number</th>
                  {isCustomerPo && <th className="py-3 pr-4">Customer PO Number</th>}
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">Order Date</th>
                  {isCustomerPo && <th className="py-3 pr-4">Required Date</th>}
                  {isCustomerPo && <th className="py-3 pr-4">Customer PO Document</th>}
                  <th className="py-3 pr-4">Payment Terms</th>
                  <th className="py-3 pr-4">Status</th>
                  {activeTab === "approval" && <th className="py-3 pr-4">Payment Risk</th>}
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Surat Jalan</th>
                  <th className="py-3 pr-4 text-right">Total</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleSalesOrders.map((order) => (
                  <tr key={order.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4 font-medium">{order.orderNumber}</td>
                    {isCustomerPo && (
                      <td className="py-3 pr-4 font-medium text-ink">
                        {order.customerPoNumber ?? "-"}
                      </td>
                    )}
                    <td className="py-3 pr-4 text-ink/80">{order.customer.companyName}</td>
                    <td className="py-3 pr-4 text-ink/80">{formatDate(order.orderDate)}</td>
                    {isCustomerPo && (
                      <td className="py-3 pr-4 font-medium text-ink">
                        {order.requiredDate ? formatDate(order.requiredDate) : "-"}
                      </td>
                    )}
                    {isCustomerPo && (
                      <td className="py-3 pr-4 text-ink/80">
                        {order.customerPoDocumentStoredName ? (
                          <Link
                            href={`/api/customer-purchase-orders/${order.id}/document`}
                            title="Unduh customer PO document"
                            className="inline-flex items-center gap-2 font-semibold text-brand"
                          >
                            <FileText aria-hidden="true" className="h-4 w-4" />
                            Unduh {order.customerPoDocumentName ?? "Customer PO document"}
                          </Link>
                        ) : "-"}
                      </td>
                    )}
                    <td className="py-3 pr-4 text-ink/80">
                      {getPaymentTermLabel({
                        paymentTermType: order.paymentTermType,
                        creditTermMonths: order.creditTermMonths
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusStack>
                        <StatusBadge status={order.status} />
                      </StatusStack>
                    </td>
                    {activeTab === "approval" && (
                      <td className="py-3 pr-4">
                        <StatusStack>
                          <StatusBadge status={order.approvalRisk ?? "Payment risk"} />
                        </StatusStack>
                      </td>
                    )}
                    <td className="py-3 pr-4">
                      {order.invoice ? (
                        <StatusStack>
                          <StatusBadge status={order.invoice.status} />
                        </StatusStack>
                      ) : "-"}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">
                      {order.deliveryNotes[0] ? (
                        <StatusStack>
                          <StatusBadge status={order.deliveryNotes[0].status} />
                        </StatusStack>
                      ) : "-"}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                      {order.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <TableActionGroup>
                        <TableActionLink
                          href={
                            activeTab === "approval"
                              ? `${basePath}?tab=approval&view=${order.id}`
                              : `${basePath}/${order.id}`
                          }
                          label={`View full ${singularLabel.toLowerCase()} detail`}
                        >
                          <Eye aria-hidden="true" />
                        </TableActionLink>
                        {activeTab === "ongoing" && !order.invoice && (
                          canCreateInvoice ? (
                            <form action={generateInvoice}>
                              <input type="hidden" name="salesOrderId" value={order.id} />
                              <TableActionButton
                                type="submit"
                                label="Generate invoice"
                              >
                                <FilePlus2 aria-hidden="true" />
                              </TableActionButton>
                            </form>
                          ) : (
                            <RestrictedAction message={invoiceRestriction}>
                              <TableActionButton disabled label="Generate invoice">
                                <FilePlus2 aria-hidden="true" />
                              </TableActionButton>
                            </RestrictedAction>
                          )
                        )}
                      </TableActionGroup>
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

function SalesOrderSourceDialog() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-strong/45 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-source-title"
        className="w-full max-w-2xl rounded-lg border border-line bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="order-source-title" className="text-xl font-semibold text-ink">
              Choose Order Source
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Is this a direct Sales Order or an order received from a customer PO?
            </p>
          </div>
          <Link
            href="/sales-orders"
            title="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink/70"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Link
            href="/sales-orders?mode=create"
            className="rounded-md border border-line p-5 transition hover:border-brand hover:bg-info/10"
          >
            <ShoppingCart aria-hidden="true" className="h-7 w-7 text-brand" />
            <h3 className="mt-3 font-semibold text-ink">Direct Sales Order</h3>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Uses an automatically generated Sales Order number.
            </p>
          </Link>
          <Link
            href="/customer-purchase-orders?mode=create"
            className="rounded-md border border-line p-5 transition hover:border-brand hover:bg-info/10"
          >
            <ClipboardList aria-hidden="true" className="h-7 w-7 text-brand" />
            <h3 className="mt-3 font-semibold text-ink">Customer PO</h3>
            <p className="mt-1 text-sm leading-6 text-ink/80">
              Generates a Sales Order Number and Customer PO Number, then requires a product required date and customer PO document upload.
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
      <p className="text-xs font-semibold uppercase text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}
