import { CombinedDeliveryNoteForm } from "@/components/combined-delivery-note-form";
import { deliverySourcesInclude, orderReference } from "@/lib/delivery-note-links";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Pencil, Plus, Printer } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { PickingListPanel } from "@/components/picking-list-panel";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import {
  TableActionGroup,
  TableActionLink,
  TableMenuLink,
  TableOverflowMenu,
} from "@/components/table-actions";
import { updateDeliveryNoteStatus } from "@/lib/actions";
import { createPickingList } from "@/lib/picking-list-actions";
import { canCreatePickingList, canFulfillOrder } from "@/lib/picking-list";
import { formatDate } from "@/lib/format";
import { getPaymentTermLabel } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import { getSearchMessage } from "@/lib/workflow";
import { requireCurrentUser } from "@/lib/session";
import { canRole } from "@/lib/role-access";

type SearchParams = Record<string, string | string[] | undefined>;
const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";
const actionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand";

export default async function SuratJalanPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const user = await requireCurrentUser();
  const canCreateSuratJalan = canRole(user.role, "CREATE_SURAT_JALAN");
  const { success, error } = getSearchMessage(params);
  const viewId = getFirst(params.view);
  const editStatusId = getFirst(params.editStatus);
  const mode = getFirst(params.mode);
  const sourceInvoiceId = getFirst(params.invoiceId);
  let sourceOrderId = getFirst(params.salesOrderId);
  if (!sourceOrderId && sourceInvoiceId) {
    sourceOrderId = (
      await prisma.invoice.findUnique({
        where: { id: sourceInvoiceId },
        select: { salesOrderId: true },
      })
    )?.salesOrderId;
  }
  const [orders, pickingRecords, deliveryNotes] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        status: { in: ["Confirmed", "Invoiced"] },
        approvalStatus: { in: ["Approved", "NotRequired"] },
        pickingList: { is: null },
        items: { some: {} },
        deliveryNotes: { none: {} },
        invoice: {
          is: { status: { not: "Cancelled" }, deliveryNotes: { none: {} } },
        },
      },
      include: { customer: true, invoice: true },
      orderBy: [{ requiredDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.pickingList.findMany({
      include: {
        items: true,
        deliveryNote: true,
        deliverySource: { include: { deliveryNote: true } },
        salesOrder: { include: { customer: true, invoice: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.deliveryNote.findMany({
      include: {
        customer: true,
        invoice: true,
        salesOrder: true,
        pickingList: true,
        sources: deliverySourcesInclude,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const pickingLists = pickingRecords.map(list => ({ ...list, deliveryNote: list.deliverySource?.deliveryNote ?? list.deliveryNote }));
  const packedOptions = pickingLists.filter(list => list.status === "Packed" && !list.deliveryNote && canFulfillOrder(list.salesOrder));
  const readyOrders = orders.filter((order) =>
    canCreatePickingList({
      ...order,
      hasPickingList: false,
      deliveryNoteCount: 0,
    }),
  );
  const activePickingLists = pickingLists.filter((list) => !list.deliveryNote);
  const openNotes = deliveryNotes.filter((note) =>
    ["Draft", "Issued"].includes(note.status),
  );
  const completedNotes = deliveryNotes.filter(
    (note) => note.status === "Delivered",
  );
  const cancelledNotes = deliveryNotes.filter(
    (note) => note.status === "Cancelled",
  );
  if (sourceOrderId) {
    const existingList = pickingLists.find(
      (list) => list.salesOrderId === sourceOrderId,
    );
    const existingNote = deliveryNotes.find(
      (note) =>
        note.sources?.some(source => source.salesOrderId === sourceOrderId) ||
        note.salesOrderId === sourceOrderId ||
        note.invoice?.salesOrderId === sourceOrderId,
    );
    if (existingNote)
      redirect(
        `/surat-jalan?tab=${["Delivered", "Cancelled"].includes(existingNote.status) ? "completed" : "open"}&view=${existingNote.id}${existingNote.status === "Cancelled" ? "&archive=cancelled" : ""}`,
      );
    if (existingList)
      redirect(`/surat-jalan?tab=picking&viewPicking=${existingList.id}`);
  }
  const requestedTab = getFirst(params.tab);
  const requestedNote = deliveryNotes.find((note) => note.id === viewId);
  const activeTab = ["completed", "done"].includes(requestedTab ?? "")
    ? "completed"
    : ["open", "ongoing"].includes(requestedTab ?? "")
      ? "open"
      : requestedTab === "picking"
        ? "picking"
        : requestedNote
          ? ["Delivered", "Cancelled"].includes(requestedNote.status)
            ? "completed"
            : "open"
          : "picking";
  const showCancelled =
    getFirst(params.archive) === "cancelled" ||
    requestedNote?.status === "Cancelled";
  const visibleDeliveryNotes =
    activeTab === "open"
      ? openNotes
      : activeTab === "completed"
        ? showCancelled
          ? cancelledNotes
          : completedNotes
        : [];
  const selectedId =
    visibleDeliveryNotes.find((note) => note.id === viewId)?.id ??
    visibleDeliveryNotes[0]?.id;
  const selectedDeliveryNote = selectedId
    ? await prisma.deliveryNote.findUnique({
        where: { id: selectedId },
        include: {
          customer: true,
          invoice: true,
          salesOrder: true,
          items: { include: { source: { include: { salesOrder: true } } }, orderBy: [{ sourceId: "asc" }, { id: "asc" }] },
          pickingList: true,
        sources: deliverySourcesInclude,
        },
      })
    : null;
  const selectedPickingList = pickingLists.find(
    (list) => list.id === getFirst(params.viewPicking),
  );
  const tabs = [
    {
      key: "picking",
      label: "Picking & Packing",
      count: readyOrders.length + activePickingLists.length,
    },
    { key: "open", label: "Surat Jalan Open", count: openNotes.length },
    { key: "completed", label: "Completed", count: completedNotes.length },
  ];
  return (
    <>
      <PageHeader
        title="Picking List & Surat Jalan"
        description="Prepare, verify, and deliver customer orders from one warehouse workflow."
        action={
          activeTab === "picking" && canCreateSuratJalan ? (
            <div className="flex flex-wrap gap-2"><Link href="/surat-jalan?tab=picking&mode=delivery" className={actionClass}>Create Surat Jalan</Link><Link
              href="/surat-jalan?tab=picking&mode=create"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Picking List
            </Link></div>
          ) : null
        }
      />
      <FlashMessage success={success} error={error} />
      <nav
        aria-label="Warehouse stages"
        className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-sm sm:inline-flex"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            aria-current={activeTab === tab.key ? "page" : undefined}
            href={`/surat-jalan?tab=${tab.key}`}
            className={`inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-semibold ${activeTab === tab.key ? "bg-brand text-white" : "text-ink/80 hover:bg-soft"}`}
          >
            {tab.label}
            <span className="ml-2 rounded-md bg-canvas/20 px-1.5 py-0.5 text-xs">
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>
      {activeTab === "picking" && (
        <>
          {(mode === "create" || sourceOrderId) && canCreateSuratJalan && (
            <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
              <h2 className="mb-3 text-lg font-semibold">Add Picking List</h2>
              <p className="mb-3 text-sm text-ink/70">
                Select an approved order ready for fulfillment.
                Both Immediate Payment and Credit orders need an active invoice.
                Full payment is not required to start picking.
              </p>
              {readyOrders.length === 0 ? (
                <EmptyState message="No orders are ready for a new Picking List." />
              ) : (
                <form
                  action={createPickingList}
                  className="flex flex-wrap items-end gap-3"
                >
                  <label className="min-w-64 flex-1 text-sm font-medium">
                    Sales Order / Customer PO
                    <select
                      name="salesOrderId"
                      required
                      defaultValue={
                        readyOrders.some((order) => order.id === sourceOrderId)
                          ? sourceOrderId
                          : ""
                      }
                      className={`${inputClass} mt-1`}
                    >
                      <option value="" disabled>
                        Select order
                      </option>
                      {readyOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber}
                          {order.customerPoNumber
                            ? ` / PO ${order.customerPoNumber}`
                            : ""}{" "}
                          · {order.customer.companyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={actionClass}>Create Picking List</button>
                </form>
              )}
            </section>
          )}
          {mode === "delivery" && canCreateSuratJalan && <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card"><CombinedDeliveryNoteForm lists={packedOptions} /></section>}
          {selectedPickingList && (
            <PickingListPanel
              list={selectedPickingList}
              deliveryOptions={packedOptions}
              canManage={canCreateSuratJalan}
              showIssueForm={getFirst(params.issue) === selectedPickingList.id}
            />
          )}
          <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-lg font-semibold">
              Ready for Picking List
            </h2>
            {readyOrders.length === 0 ? (
              <EmptyState message="No orders awaiting a Picking List." />
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                    <tr>
                      <th className="py-3 pr-4">SO / Customer PO</th>
                      <th className="py-3 pr-4">Customer</th>
                      <th className="py-3 pr-4">Required date</th>
                      <th className="py-3 pr-4">Payment terms</th>
                      <th className="py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {readyOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="py-3 pr-4 font-medium">
                          {order.orderNumber}
                          {order.customerPoNumber && (
                            <p className="text-xs text-ink/70">
                              PO {order.customerPoNumber}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {order.customer.companyName}
                        </td>
                        <td className="py-3 pr-4">
                          {order.requiredDate
                            ? formatDate(order.requiredDate)
                            : "-"}
                        </td>
                        <td className="py-3 pr-4">
                          {getPaymentTermLabel(order)}
                        </td>
                        <td className="py-3">
                          {canCreateSuratJalan ? (
                            <form action={createPickingList}>
                              <input
                                type="hidden"
                                name="salesOrderId"
                                value={order.id}
                              />
                              <button className={actionClass}>
                                Add Picking List
                              </button>
                            </form>
                          ) : (
                            <span className="text-ink/50">Admin / Manager</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="rounded-md border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-lg font-semibold">
              Picking Lists in Progress
            </h2>
            {activePickingLists.length === 0 ? (
              <EmptyState message="No Picking Lists in progress." />
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                    <tr>
                      <th className="py-3 pr-4">Picking List</th>
                      <th className="py-3 pr-4">Customer / Order</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Packed / Ordered</th>
                      <th className="py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-sm">
                    {activePickingLists.map((list) => (
                      <tr key={list.id}>
                        <td className="py-3 pr-4 font-medium">
                          {list.pickingListNumber}
                        </td>
                        <td className="py-3 pr-4">
                          {list.salesOrder.customer.companyName}
                          <p className="text-xs text-ink/70">
                            {list.salesOrder.orderNumber}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge
                            status={
                              list.status === "Pending"
                                ? "Ready to Pick"
                                : list.status === "InProgress"
                                  ? "Picking & Packing"
                                  : "Packed"
                            }
                          />
                        </td>
                        <td className="py-3 pr-4">
                          {list.items.reduce(
                            (sum, item) => sum + item.packedQuantity,
                            0,
                          )}{" "}
                          /{" "}
                          {list.items.reduce(
                            (sum, item) => sum + item.orderedQuantity,
                            0,
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Link
                              className={actionClass}
                              href={`/surat-jalan?tab=picking&viewPicking=${list.id}`}
                            >
                              View
                            </Link>
                            <Link
                              className={actionClass}
                              href={`/surat-jalan/picking-list/${list.id}/print`}
                            >
                              Print
                            </Link>
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
      )}
      {activeTab === "completed" && (
        <div className="mb-4 flex gap-4 text-sm font-semibold">
          <Link
            className={!showCancelled ? "text-brand" : "text-ink/60"}
            href="/surat-jalan?tab=completed"
          >
            Delivered ({completedNotes.length})
          </Link>
          <Link
            className={showCancelled ? "text-brand" : "text-ink/60"}
            href="/surat-jalan?tab=completed&archive=cancelled"
          >
            Cancelled archive ({cancelledNotes.length})
          </Link>
        </div>
      )}
      {activeTab !== "picking" && selectedDeliveryNote && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-ink/50">
                Surat Jalan
              </p>
              <h2 className="mt-1 text-2xl font-semibold">
                {selectedDeliveryNote.deliveryNoteNumber}
              </h2>
              <p className="mt-1 text-sm text-ink/80">
                {selectedDeliveryNote.sources?.length ? selectedDeliveryNote.sources.map(source => orderReference(source.salesOrder)).join(", ") : orderReference(selectedDeliveryNote.salesOrder)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={selectedDeliveryNote.status} />
              {activeTab === "open" && canCreateSuratJalan && (
                <Link
                  href={`/surat-jalan?tab=${activeTab}&view=${selectedDeliveryNote.id}&editStatus=${selectedDeliveryNote.id}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand"
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  Edit Status
                </Link>
              )}
              {selectedDeliveryNote.pickingList && (
                <Link
                  className="text-sm font-semibold text-brand"
                  href={`/surat-jalan/picking-list/${selectedDeliveryNote.pickingList.id}/print`}
                >
                  Print Picking List
                </Link>
              )}
              <Link
                href={`/surat-jalan/${selectedDeliveryNote.id}/print`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
              >
                <Printer aria-hidden="true" className="h-4 w-4" />
                Cetak
              </Link>
            </div>
          </div>

          {activeTab === "open" &&
            canCreateSuratJalan &&
            editStatusId === selectedDeliveryNote.id && (
              <form
                action={updateDeliveryNoteStatus}
                className="mb-5 grid gap-3 rounded-md border border-line bg-soft p-4 sm:grid-cols-[1fr_auto_auto]"
              >
                <input
                  type="hidden"
                  name="id"
                  value={selectedDeliveryNote.id}
                />
                <label className="text-sm font-medium text-ink">
                  Status
                  <select
                    name="status"
                    defaultValue={
                      selectedDeliveryNote.status === "Draft"
                        ? "Issued"
                        : "Delivered"
                    }
                    className={`${inputClass} mt-1`}
                  >
                    {selectedDeliveryNote.status === "Draft" ? (
                      <option value="Issued">Issued</option>
                    ) : (
                      <option value="Delivered">Delivered</option>
                    )}
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
                    className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            )}

          <div className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
            <Detail
              label="Picking List"
              value={
                selectedDeliveryNote.sources?.map(source => source.pickingList.pickingListNumber).join(", ") || selectedDeliveryNote.pickingList?.pickingListNumber ||
                "Historical delivery"
              }
            />
            <Detail
              label="Recipient"
              value={selectedDeliveryNote.recipientName}
            />
            <Detail
              label="Customer"
              value={selectedDeliveryNote.customer.companyName}
            />
            <Detail label="Phone" value={selectedDeliveryNote.recipientPhone} />
            <Detail
              label="Delivery Date"
              value={formatDate(selectedDeliveryNote.deliveryDate)}
            />
            <Detail
              label="Invoice"
              value={selectedDeliveryNote.sources?.map(source => source.invoice.invoiceNumber).join(", ") || selectedDeliveryNote.invoice?.invoiceNumber || "-"}
            />
            <Detail
              label="Payment Terms"
              value={
                selectedDeliveryNote.sources?.length ? selectedDeliveryNote.sources.map(source => source.invoice.invoiceNumber + ": " + getPaymentTermLabel(source.invoice)).join("; ") : selectedDeliveryNote.invoice
                  ? getPaymentTermLabel({
                      paymentTermType:
                        selectedDeliveryNote.invoice.paymentTermType,
                      creditTermMonths:
                        selectedDeliveryNote.invoice.creditTermMonths,
                      creditTermWeeks:
                        selectedDeliveryNote.invoice.creditTermWeeks,
                    })
                  : "-"
              }
            />
            <Detail
              label="Sales Order"
              value={selectedDeliveryNote.sources?.map(source => orderReference(source.salesOrder)).join(", ") || orderReference(selectedDeliveryNote.salesOrder)}
            />
            {selectedDeliveryNote.salesOrder?.source === "CUSTOMER_PO" && (
              <Detail
                label="Customer PO Number"
                value={selectedDeliveryNote.salesOrder.customerPoNumber ?? "-"}
              />
            )}
            <Detail
              label="Driver Name"
              value={selectedDeliveryNote.driverName ?? "Not recorded"}
            />
            <Detail
              label="Vehicle Plate Number"
              value={selectedDeliveryNote.vehiclePlateNumber ?? "Not recorded"}
            />
            <Detail
              label="Sender"
              value={selectedDeliveryNote.senderName ?? "-"}
            />
            <Detail
              label="Authorized By"
              value={selectedDeliveryNote.authorizedBy ?? "-"}
            />
          </div>

          <p className="mt-4 rounded-md bg-soft p-3 text-sm text-ink/80">
            {selectedDeliveryNote.recipientAddress}
          </p>

          {selectedDeliveryNote.notes && (
            <p className="mt-3 rounded-md bg-soft p-3 text-sm text-ink/80">
              {selectedDeliveryNote.notes}
            </p>
          )}

          <div className="mt-6 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">SO / Customer PO</th>
                  <th className="py-3 pr-4">Product Code</th>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Qty</th>
                  <th className="py-3 pr-4">Unit</th>
                  <th className="py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-sm">
                {selectedDeliveryNote.items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-soft">
                    <td className="py-3 pr-4">{orderReference(item.source?.salesOrder ?? selectedDeliveryNote.salesOrder)}</td>
                    <td className="py-3 pr-4 text-ink/80">
                      {item.productCode ?? "-"}
                    </td>
                    <td className="py-3 pr-4 font-medium">{item.itemName}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">
                      {item.quantity}
                    </td>
                    <td className="py-3 pr-4 text-ink/80">{item.unit}</td>
                    <td className="py-3 text-ink/80">
                      {item.description ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab !== "picking" && (
        <section className="rounded-md border border-line bg-white p-5 shadow-card">
          {visibleDeliveryNotes.length === 0 ? (
            <EmptyState
              message={
                activeTab === "completed"
                  ? "No completed Surat Jalan."
                  : "No ongoing Surat Jalan."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                  <tr>
                    <th className="py-3 pr-4">Surat Jalan No.</th>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Recipient</th>
                    <th className="py-3 pr-4">Invoice</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Notes</th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-sm">
                  {visibleDeliveryNotes.map((deliveryNote) => (
                    <tr
                      key={deliveryNote.id}
                      className="transition hover:bg-soft"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {deliveryNote.deliveryNoteNumber}
                      </td>
                      <td className="py-3 pr-4 text-ink/80">
                        {formatDate(deliveryNote.deliveryDate)}
                      </td>
                      <td className="py-3 pr-4 text-ink/80">
                        {deliveryNote.recipientName}
                      </td>
                      <td className="py-3 pr-4 text-ink/80">
                        {deliveryNote.sources?.map(source => source.invoice.invoiceNumber).join(", ") || deliveryNote.invoice?.invoiceNumber || "-"}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusStack>
                          <StatusBadge status={deliveryNote.status} />
                        </StatusStack>
                      </td>
                      <td className="max-w-64 whitespace-pre-wrap py-3 pr-4 text-ink/80">
                        {deliveryNote.notes ?? "-"}
                      </td>
                      <td className="py-3">
                        <TableActionGroup>
                          {
                            <TableActionLink
                              href={`/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}${deliveryNote.status === "Cancelled" ? "&archive=cancelled" : ""}`}
                              label="View Surat Jalan"
                            >
                              <Eye aria-hidden="true" />
                            </TableActionLink>
                          }
                          {activeTab === "open" && canCreateSuratJalan && (
                            <TableActionLink
                              href={`/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}&editStatus=${deliveryNote.id}`}
                              label="Edit status"
                            >
                              <Pencil aria-hidden="true" />
                            </TableActionLink>
                          )}
                          <TableOverflowMenu label="More Surat Jalan actions">
                            <TableMenuLink
                              href={`/surat-jalan/${deliveryNote.id}/print`}
                              label="Print Surat Jalan"
                            >
                              <Printer aria-hidden="true" />
                            </TableMenuLink>
                          </TableOverflowMenu>
                        </TableActionGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
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
