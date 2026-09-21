import { CombinedDeliveryNoteForm } from "@/components/combined-delivery-note-form";
import { DeliveryNoteDraftForm } from "@/components/delivery-note-draft-form";
import { DeliveryNoteStatusActions } from "@/components/delivery-note-status-actions";
import { deliverySourcesInclude, orderReference } from "@/lib/delivery-note-links";
import Link from "next/link";
import type { DeliveryNoteStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { CircleCheckBig, Eye, Pencil, Plus, Printer } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatusStack } from "@/components/status-stack";
import {
  TableActionGroup,
  TableActionLink,
  TableMenuLink,
  TableOverflowMenu,
} from "@/components/table-actions";
import {
  canCreateDeliveryFromPickingList,
  canFulfillOrder,
} from "@/lib/picking-list";
import { formatDate } from "@/lib/format";
import {
  getDeliveryNoteStatusLabel,
  toJakartaDateTimeInputValue
} from "@/lib/delivery-note-status";
import { getPaymentTermLabel } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import { getSearchMessage } from "@/lib/workflow";
import { requireCurrentUser } from "@/lib/session";
import { canRole } from "@/lib/role-access";
import { ServerPagination } from "@/components/server-pagination";
import {
  getCursorArgs,
  getCursorPage,
  getCursorPagination,
} from "@/lib/pagination";

type SearchParams = Record<string, string | string[] | undefined>;
export default async function SuratJalanPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  if (getFirst(params.tab) === "picking") {
    redirect("/pick-pack");
  }
  const user = await requireCurrentUser();
  const canCreateSuratJalan = canRole(user.role, "CREATE_SURAT_JALAN");
  const { success, error } = getSearchMessage(params);
  const viewId = getFirst(params.view);
  const receiveId = getFirst(params.receive) ?? getFirst(params.editStatus);
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
  if (sourceOrderId) {
    const [existingList, existingNote] = await Promise.all([
      prisma.pickingList.findUnique({
        where: { salesOrderId: sourceOrderId },
        include: {
          deliveryNote: true,
          deliverySource: { include: { deliveryNote: true } },
        },
      }),
      prisma.deliveryNote.findFirst({
        where: {
          OR: [
            { salesOrderId: sourceOrderId },
            { invoice: { is: { salesOrderId: sourceOrderId } } },
            { sources: { some: { salesOrderId: sourceOrderId } } },
          ],
        },
        select: { id: true, status: true },
      }),
    ]);
    const linkedNote =
      existingNote ??
      existingList?.deliverySource?.deliveryNote ??
      existingList?.deliveryNote;
    if (linkedNote) {
      redirect(
        `/surat-jalan?tab=${["Delivered", "Cancelled"].includes(linkedNote.status) ? "completed" : "open"}&view=${linkedNote.id}${linkedNote.status === "Cancelled" ? "&archive=cancelled" : ""}`,
      );
    }
    if (existingList) redirect(`/pick-pack?view=${existingList.id}`);
  }

  const requestedNote = viewId
    ? await prisma.deliveryNote.findUnique({
        where: { id: viewId },
        select: { id: true, status: true },
      })
    : null;
  const requestedTab = getFirst(params.tab);
  const activeTab = ["completed", "done"].includes(requestedTab ?? "")
    ? "completed"
    : ["open", "ongoing"].includes(requestedTab ?? "")
      ? "open"
      : requestedNote && ["Delivered", "Cancelled"].includes(requestedNote.status)
        ? "completed"
        : "open";
  const showCancelled =
    getFirst(params.archive) === "cancelled" ||
    requestedNote?.status === "Cancelled";
  const visibleStatuses: DeliveryNoteStatus[] =
    activeTab === "open"
      ? ["Draft", "Issued"]
      : showCancelled
        ? ["Cancelled"]
        : ["Delivered"];
  const pagination = getCursorPagination(params);

  const [
    pickingRecords,
    deliveryNoteRecords,
    openCount,
    completedCount,
    cancelledCount,
  ] = await Promise.all([
    mode === "create" ? prisma.pickingList.findMany({
      relationLoadStrategy: "join",
      where: { status: "Packed" },
      include: {
        items: true,
        deliveryNote: true,
        deliverySource: { include: { deliveryNote: true } },
        salesOrder: { include: { customer: true, invoice: true } },
      },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
    prisma.deliveryNote.findMany({
      relationLoadStrategy: "join",
      where: { status: { in: visibleStatuses } },
      include: {
        invoice: true,
        sources: deliverySourcesInclude,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...getCursorArgs(pagination),
    }),
    prisma.deliveryNote.count({ where: { status: { in: ["Draft", "Issued"] } } }),
    prisma.deliveryNote.count({ where: { status: "Delivered" } }),
    prisma.deliveryNote.count({ where: { status: "Cancelled" } }),
  ]);
  const deliveryNotePage = getCursorPage(deliveryNoteRecords, pagination);
  const visibleDeliveryNotes = deliveryNotePage.items.filter((note) =>
    visibleStatuses.includes(note.status),
  );
  const pickingLists = pickingRecords.map(list => ({ ...list, deliveryNote: list.deliverySource?.deliveryNote ?? list.deliveryNote }));
  const packedOptions = pickingLists.filter(
    (list) =>
      list.status === "Packed" &&
      !list.deliveryNote &&
      canFulfillOrder(list.salesOrder) &&
      canCreateDeliveryFromPickingList(list.items),
  );
  const selectedId =
    (requestedNote && visibleStatuses.includes(requestedNote.status)
      ? requestedNote.id
      : undefined) ??
    visibleDeliveryNotes[0]?.id;
  const selectedDeliveryNote = selectedId
    ? await prisma.deliveryNote.findUnique({
        relationLoadStrategy: "join",
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
  const tabs = [
    { key: "open", label: "Surat Jalan Open", count: openCount },
    { key: "completed", label: "Completed", count: completedCount },
  ];
  return (
    <>
      <PageHeader
        title="Surat Jalan"
        description="Issue and track delivery documents for orders that have completed Pick & Pack."
        action={
          canCreateSuratJalan ? (
            <Link
              href="/surat-jalan?mode=create"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Surat Jalan
            </Link>
          ) : null
        }
      />
      <FlashMessage success={success} error={error} />
      <nav
        aria-label="Surat Jalan stages"
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
      {mode === "create" && canCreateSuratJalan && (
        <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
          <CombinedDeliveryNoteForm
            lists={packedOptions}
            initialPickingListId={getFirst(params.pickingListId)}
          />
        </section>
      )}
      {activeTab === "completed" && (
        <div className="mb-4 flex gap-4 text-sm font-semibold">
          <Link
            className={!showCancelled ? "text-brand" : "text-ink/60"}
            href="/surat-jalan?tab=completed"
          >
            Diterima ({completedCount})
          </Link>
          <Link
            className={showCancelled ? "text-brand" : "text-ink/60"}
            href="/surat-jalan?tab=completed&archive=cancelled"
          >
            Cancelled archive ({cancelledCount})
          </Link>
        </div>
      )}
      {selectedDeliveryNote && (
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
              <StatusBadge
                status={selectedDeliveryNote.status}
                label={getDeliveryNoteStatusLabel(selectedDeliveryNote.status)}
              />
              {activeTab === "open" &&
                canCreateSuratJalan &&
                (selectedDeliveryNote.status === "Draft" ||
                  selectedDeliveryNote.status === "Issued") && (
                  <DeliveryNoteStatusActions
                    deliveryNoteId={selectedDeliveryNote.id}
                    status={selectedDeliveryNote.status}
                    defaultReceivedAt={toJakartaDateTimeInputValue(new Date())}
                    defaultReceiverName={selectedDeliveryNote.receiverName ?? ""}
                    initialReceiveOpen={receiveId === selectedDeliveryNote.id}
                  />
                )}
              {selectedDeliveryNote.pickingList && (
                <Link
                  className="text-sm font-semibold text-brand"
                  href={`/pick-pack/${selectedDeliveryNote.pickingList.id}/print`}
                >
                  Print Picking List
                </Link>
              )}
              {selectedDeliveryNote.issuedAt && (
                <Link
                  href={`/surat-jalan/${selectedDeliveryNote.id}/print`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
                >
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  Cetak
                </Link>
              )}
            </div>
          </div>

          {selectedDeliveryNote.status === "Draft" && canCreateSuratJalan && (
            <DeliveryNoteDraftForm
              note={{
                id: selectedDeliveryNote.id,
                updatedAt: selectedDeliveryNote.updatedAt.toISOString(),
                recipientName: selectedDeliveryNote.recipientName,
                recipientPhone: selectedDeliveryNote.recipientPhone,
                recipientAddress: selectedDeliveryNote.recipientAddress,
                deliveryDate: selectedDeliveryNote.deliveryDate.toISOString().slice(0, 10),
                notes: selectedDeliveryNote.notes,
                senderName: selectedDeliveryNote.senderName,
                driverName: selectedDeliveryNote.driverName,
                vehiclePlateNumber: selectedDeliveryNote.vehiclePlateNumber,
                authorizedBy: selectedDeliveryNote.authorizedBy,
                items: selectedDeliveryNote.items.map(item => ({
                  id: item.id,
                  sourceLabel: orderReference(item.source?.salesOrder ?? selectedDeliveryNote.salesOrder),
                  itemName: item.itemName,
                  orderedQuantitySnapshot: item.orderedQuantitySnapshot,
                  packedQuantitySnapshot: item.packedQuantitySnapshot,
                  quantity: item.quantity,
                  outstandingQuantity: item.outstandingQuantity,
                  adjustmentNote: item.adjustmentNote,
                  unit: item.unit
                }))
              }}
            />
          )}

          <DeliveryProgress
            status={selectedDeliveryNote.status}
            createdAt={selectedDeliveryNote.createdAt}
            createdBy={selectedDeliveryNote.createdBy}
            issuedAt={selectedDeliveryNote.issuedAt}
            issuedBy={selectedDeliveryNote.issuedBy}
            receivedAt={selectedDeliveryNote.receivedAt}
            receivedBy={selectedDeliveryNote.receivedBy}
            receiverName={selectedDeliveryNote.receiverName}
          />

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
            {selectedDeliveryNote.receivedAt && (
              <Detail
                label="Received At"
                value={formatJakartaDateTime(selectedDeliveryNote.receivedAt)}
              />
            )}
            {selectedDeliveryNote.receiverName && (
              <Detail label="Received By" value={selectedDeliveryNote.receiverName} />
            )}
          </div>

          <p className="mt-4 rounded-md bg-soft p-3 text-sm text-ink/80">
            {selectedDeliveryNote.recipientAddress}
          </p>

          {selectedDeliveryNote.notes && (
            <p className="mt-3 rounded-md bg-soft p-3 text-sm text-ink/80">
              {selectedDeliveryNote.notes}
            </p>
          )}
          {selectedDeliveryNote.receiptNotes && (
            <div className="mt-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-ink">
              <p className="font-semibold">Catatan Penerimaan</p>
              <p className="mt-1 whitespace-pre-wrap">{selectedDeliveryNote.receiptNotes}</p>
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                <tr>
                  <th className="py-3 pr-4">SO / Customer PO</th>
                  <th className="py-3 pr-4">Product Code</th>
                  <th className="py-3 pr-4">Product Name</th>
                  <th className="py-3 pr-4 text-right">Ordered</th>
                  <th className="py-3 pr-4 text-right">Packed</th>
                  <th className="py-3 pr-4 text-right">Final Send</th>
                  <th className="py-3 pr-4 text-right">Outstanding</th>
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
                    <td className="py-3 pr-4 text-right text-ink/80">{item.orderedQuantitySnapshot}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">{item.packedQuantitySnapshot}</td>
                    <td className="py-3 pr-4 text-right font-semibold">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right text-ink/80">{item.outstandingQuantity}</td>
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
              <table data-server-paginated="true">
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
                          <StatusBadge
                            status={deliveryNote.status}
                            label={getDeliveryNoteStatusLabel(deliveryNote.status)}
                          />
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
                              href={deliveryNote.status === "Draft" ? `/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}` : `/surat-jalan?tab=${activeTab}&view=${deliveryNote.id}&receive=${deliveryNote.id}`}
                              label={deliveryNote.status === "Draft" ? "Edit Draft" : "Tandai Sudah Diterima"}
                            >
                              {deliveryNote.status === "Draft" ? (
                                <Pencil aria-hidden="true" />
                              ) : (
                                <CircleCheckBig aria-hidden="true" />
                              )}
                            </TableActionLink>
                          )}
                          {deliveryNote.issuedAt && (
                            <TableOverflowMenu label="More Surat Jalan actions">
                              <TableMenuLink
                                href={`/surat-jalan/${deliveryNote.id}/print`}
                                label="Print Surat Jalan"
                              >
                                <Printer aria-hidden="true" />
                              </TableMenuLink>
                            </TableOverflowMenu>
                          )}
                        </TableActionGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ServerPagination
            hasNext={deliveryNotePage.hasNext}
            label="delivery notes"
            nextCursor={deliveryNotePage.nextCursor}
            pathname="/surat-jalan"
            searchParams={params}
            state={pagination}
          />
      </section>
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

function DeliveryProgress({
  status,
  createdAt,
  createdBy,
  issuedAt,
  issuedBy,
  receivedAt,
  receivedBy,
  receiverName
}: {
  status: DeliveryNoteStatus;
  createdAt: Date;
  createdBy: string | null;
  issuedAt: Date | null;
  issuedBy: string | null;
  receivedAt: Date | null;
  receivedBy: string | null;
  receiverName: string | null;
}) {
  const steps = [
    {
      label: "Dibuat",
      completed: true,
      detail: `${formatJakartaDateTime(createdAt)} · ${createdBy ?? "Data historis"}`
    },
    {
      label: "Dikirim",
      completed: Boolean(issuedAt),
      detail: issuedAt
        ? `${formatJakartaDateTime(issuedAt)} · ${issuedBy ?? "Data historis"}`
        : "Menunggu Surat Jalan dikirim"
    },
    {
      label: "Diterima",
      completed: Boolean(receivedAt),
      detail: receivedAt
        ? `${formatJakartaDateTime(receivedAt)} · ${receiverName ?? "Penerima tidak tercatat"}${receivedBy ? ` (dicatat ${receivedBy})` : ""}`
        : "Menunggu konfirmasi penerimaan"
    }
  ];

  return (
    <section className="my-5 rounded-md border border-line bg-soft p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Progres Pengiriman</h3>
        {status === "Cancelled" && (
          <span className="text-xs font-semibold text-danger">Surat Jalan dibatalkan</span>
        )}
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-3 rounded-md bg-white p-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.completed ? "bg-success text-white" : "bg-canvas text-ink/50"}`}
            >
              {step.completed ? "✓" : index + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{step.label}</p>
              <p className="mt-1 text-xs leading-5 text-ink/70">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatJakartaDateTime(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
