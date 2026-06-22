import Link from "next/link";
import { Eye, Pencil, Plus, Printer } from "lucide-react";
import { DeliveryNoteForm } from "@/components/delivery-note-form";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { ProcessTabs, normalizeProcessTab } from "@/components/process-tabs";
import { StatusBadge } from "@/components/status-badge";
import { RestrictedAction } from "@/components/restricted-action";
import { createDeliveryNote, updateDeliveryNoteStatus } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { canCreateDeliveryNoteForInvoice, getPaymentTermLabel } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import { isDoneDeliveryNote, isOngoingDeliveryNote } from "@/lib/process-status";
import { getSearchMessage, toDateInputValue } from "@/lib/workflow";
import { getCurrentUser } from "@/lib/session";
import { canRole, getRestrictionMessage } from "@/lib/role-access";

type SearchParams = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";

export default async function SuratJalanPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
  const editStatusId = getFirst(params.editStatus);
  const invoiceId = getFirst(params.invoiceId);
  const salesOrderId = getFirst(params.salesOrderId);
  const activeTab = normalizeProcessTab(params.tab);
  const { success, error } = getSearchMessage(params);
  const currentUser = await getCurrentUser();
  const canCreateSuratJalan = canRole(currentUser?.role, "CREATE_SURAT_JALAN");
  const suratJalanRestriction = getRestrictionMessage("CREATE_SURAT_JALAN");

  const [customers, invoices, salesOrders, deliveryNotes] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { companyName: "asc" },
      select: {
        id: true,
        name: true,
        companyName: true,
        phone: true,
        address: true
      }
    }),
    prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        salesOrder: {
          include: {
            items: true
          }
        }
      }
    }),
    prisma.salesOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        items: true
      }
    }),
    prisma.deliveryNote.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        invoice: true
      }
    })
  ]);

  const ongoingDeliveryNotes = deliveryNotes.filter((deliveryNote) =>
    isOngoingDeliveryNote(deliveryNote.status)
  );
  const doneDeliveryNotes = deliveryNotes.filter((deliveryNote) =>
    isDoneDeliveryNote(deliveryNote.status)
  );
  const visibleDeliveryNotes =
    activeTab === "done" ? doneDeliveryNotes : ongoingDeliveryNotes;

  const selectedDeliveryNote = viewId
    ? await prisma.deliveryNote.findUnique({
        where: { id: viewId },
        include: {
          customer: true,
          invoice: true,
          salesOrder: true,
          items: true
        }
      })
    : visibleDeliveryNotes[0]
      ? await prisma.deliveryNote.findUnique({
          where: { id: visibleDeliveryNotes[0].id },
          include: {
            customer: true,
            invoice: true,
            salesOrder: true,
            items: true
          }
        })
      : null;

  return (
    <>
      <PageHeader
        title="Surat Jalan"
        description="Manage delivery note documents for invoice and sales order fulfillment."
        action={
          activeTab === "ongoing" ? (
            canCreateSuratJalan ? (
              <Link
                href="/surat-jalan?mode=create"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add Surat Jalan
              </Link>
            ) : (
              <RestrictedAction message={suratJalanRestriction}>
                <button disabled className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-200 px-4 text-sm font-semibold text-slate-500">
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add Surat Jalan
                </button>
              </RestrictedAction>
            )
          ) : null
        }
      />

      <FlashMessage success={success} error={error} />

      <ProcessTabs
        basePath="/surat-jalan"
        activeTab={activeTab}
        ongoingCount={ongoingDeliveryNotes.length}
        doneCount={doneDeliveryNotes.length}
      />

      {activeTab === "ongoing" && mode === "create" && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <h2 className="mb-4 text-lg font-semibold">Create Surat Jalan</h2>
          {customers.length === 0 ? (
            <EmptyState message="Add a customer before creating Surat Jalan." />
          ) : (
            <DeliveryNoteForm
              customers={customers}
              invoices={invoices.map((invoice) => ({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                status: invoice.status,
                paymentTermType: invoice.paymentTermType,
                paymentTermLabel: getPaymentTermLabel({
                  paymentTermType: invoice.paymentTermType,
                  creditTermMonths: invoice.creditTermMonths
                }),
                canCreateDeliveryNote: canCreateDeliveryNoteForInvoice({
                  paymentTermType: invoice.paymentTermType,
                  status: invoice.status
                }),
                customerId: invoice.customerId,
                salesOrderId: invoice.salesOrderId,
                customerName: invoice.customer.companyName,
                recipientName: invoice.customer.name,
                recipientPhone: invoice.customer.phone,
                recipientAddress: invoice.customer.address,
                items: invoice.salesOrder.items.map((item) => ({
                  itemName: item.itemName,
                  quantity: item.quantity
                }))
              }))}
              salesOrders={salesOrders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                customerName: order.customer.companyName,
                recipientName: order.customer.name,
                recipientPhone: order.customer.phone,
                recipientAddress: order.customer.address,
                items: order.items.map((item) => ({
                  itemName: item.itemName,
                  quantity: item.quantity
                }))
              }))}
              action={createDeliveryNote}
              today={toDateInputValue()}
              initialInvoiceId={invoiceId}
              initialSalesOrderId={salesOrderId}
              disabled={!canCreateSuratJalan}
              restrictionMessage={suratJalanRestriction}
            />
          )}
        </section>
      )}

      {activeTab === "ongoing" && selectedDeliveryNote && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-slate-400">Surat Jalan</p>
              <h2 className="mt-1 text-2xl font-semibold">
                {selectedDeliveryNote.deliveryNoteNumber}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {selectedDeliveryNote.invoice?.invoiceNumber ??
                  selectedDeliveryNote.salesOrder?.orderNumber ??
                  "Manual delivery note"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedDeliveryNote.status} />
              <Link
                href={`/surat-jalan?tab=${activeTab}&view=${selectedDeliveryNote.id}&editStatus=${selectedDeliveryNote.id}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
                Edit Status
              </Link>
              <Link
                href={`/surat-jalan/${selectedDeliveryNote.id}/print`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                View / Print
              </Link>
            </div>
          </div>

          {editStatusId === selectedDeliveryNote.id && (
            <form
              action={updateDeliveryNoteStatus}
              className="mb-5 grid gap-3 rounded-md border border-line bg-slate-50 p-4 sm:grid-cols-[1fr_auto_auto]"
            >
              <input type="hidden" name="id" value={selectedDeliveryNote.id} />
              <label className="text-sm font-medium text-slate-700">
                Status
                <select
                  name="status"
                  defaultValue={selectedDeliveryNote.status}
                  className={`${inputClass} mt-1`}
                >
                  <option value="Draft">Draft</option>
                  <option value="Issued">Issued</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>
              <div className="flex items-end">
                <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
                  Save Status
                </button>
              </div>
              <div className="flex items-end">
                <Link
                  href={`/surat-jalan?tab=${activeTab}&view=${selectedDeliveryNote.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-slate-600"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}

          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Recipient" value={selectedDeliveryNote.recipientName} />
            <Detail label="Customer" value={selectedDeliveryNote.customer.companyName} />
            <Detail label="Phone" value={selectedDeliveryNote.recipientPhone} />
            <Detail label="Delivery Date" value={formatDate(selectedDeliveryNote.deliveryDate)} />
            <Detail
              label="Invoice"
              value={selectedDeliveryNote.invoice?.invoiceNumber ?? "-"}
            />
            <Detail
              label="Payment Term"
              value={
                selectedDeliveryNote.invoice
                  ? getPaymentTermLabel({
                      paymentTermType: selectedDeliveryNote.invoice.paymentTermType,
                      creditTermMonths: selectedDeliveryNote.invoice.creditTermMonths
                    })
                  : "-"
              }
            />
            <Detail
              label="Sales Order"
              value={selectedDeliveryNote.salesOrder?.orderNumber ?? "-"}
            />
            <Detail label="Sender" value={selectedDeliveryNote.senderName ?? "-"} />
            <Detail label="Authorized By" value={selectedDeliveryNote.authorizedBy ?? "-"} />
          </div>

          <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
            {selectedDeliveryNote.recipientAddress}
          </p>

          {selectedDeliveryNote.notes && (
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
              {selectedDeliveryNote.notes}
            </p>
          )}

          <div className="mt-6 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Product Code</th>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4">Unit</th>
                  <th className="py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedDeliveryNote.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-600">{item.productCode ?? "-"}</td>
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.unit}</td>
                    <td className="py-3 text-slate-600">{item.description ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-md border border-line bg-white p-5 shadow-soft">
        {visibleDeliveryNotes.length === 0 ? (
          <EmptyState
            message={
              activeTab === "done"
                ? "No completed Surat Jalan."
                : "No ongoing Surat Jalan."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Surat Jalan No.</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Recipient</th>
                  <th className="py-3 pr-4">Invoice</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Notes</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {visibleDeliveryNotes.map((deliveryNote) => (
                  <tr key={deliveryNote.id} className="transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium">
                      {deliveryNote.deliveryNoteNumber}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {formatDate(deliveryNote.deliveryDate)}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {deliveryNote.recipientName}
                    </td>
                    <td className="py-3 pr-4 text-slate-600">
                      {deliveryNote.invoice?.invoiceNumber ?? "-"}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={deliveryNote.status} />
                    </td>
                    <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-slate-600">
                      {deliveryNote.notes ?? "-"}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        {activeTab === "ongoing" && (
                          <Link
                            href={`/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}`}
                            title="View Surat Jalan"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                          >
                            <Eye aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        )}
                        <Link
                          href={`/surat-jalan/${deliveryNote.id}/print`}
                          title="Print Surat Jalan"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                        >
                          <Printer aria-hidden="true" className="h-4 w-4" />
                        </Link>
                        {activeTab === "ongoing" && (
                          <Link
                            href={`/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}&editStatus=${deliveryNote.id}`}
                            title="Edit status"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-brand"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </Link>
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
