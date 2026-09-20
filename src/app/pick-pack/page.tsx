import Link from "next/link";
import type { DeliveryNoteStatus, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";
import { PageHeader } from "@/components/page-header";
import { PickingListPanel } from "@/components/picking-list-panel";
import { StatusBadge } from "@/components/status-badge";
import { createPickingList } from "@/lib/picking-list-actions";
import { canCreatePickingList } from "@/lib/picking-list";
import { formatDate, formatDateTime } from "@/lib/format";
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
type PickPackTab = "active" | "completed";

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand";
const actionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-brand";

export default async function PickPackPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const user = await requireCurrentUser();
  const canManage = canRole(user.role, "CREATE_SURAT_JALAN");
  const { success, error } = getSearchMessage(params);
  const mode = getFirst(params.mode);
  const viewId = getFirst(params.view);
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
    const existingList = await prisma.pickingList.findUnique({
      where: { salesOrderId: sourceOrderId },
      include: {
        deliveryNote: true,
        deliverySource: { include: { deliveryNote: true } },
      },
    });
    if (existingList) {
      const linkedNote =
        existingList.deliverySource?.deliveryNote ?? existingList.deliveryNote;
      const target = linkedNote
        ? `/surat-jalan?view=${linkedNote.id}`
        : `/pick-pack?tab=${existingList.status === "Packed" ? "completed" : "active"}&view=${existingList.id}`;
      if (viewId !== existingList.id) redirect(target);
    }
  }

  const selectedPickingRecord = viewId
    ? await prisma.pickingList.findUnique({
        relationLoadStrategy: "join",
        where: { id: viewId },
        include: {
          items: true,
          deliveryNote: true,
          deliverySource: { include: { deliveryNote: true } },
          salesOrder: { include: { customer: true, invoice: true } },
        },
      })
    : null;
  const selectedPickingList = selectedPickingRecord
    ? {
        ...selectedPickingRecord,
        deliveryNote:
          selectedPickingRecord.deliverySource?.deliveryNote ??
          selectedPickingRecord.deliveryNote,
      }
    : null;
  const requestedTab = getFirst(params.tab);
  const activeTab: PickPackTab =
    requestedTab === "completed" ||
    (!requestedTab && selectedPickingList?.status === "Packed")
      ? "completed"
      : "active";
  const selectedForTab =
    selectedPickingList &&
    ((activeTab === "completed" && selectedPickingList.status === "Packed") ||
      (activeTab === "active" && selectedPickingList.status !== "Packed"))
      ? selectedPickingList
      : null;

  const filters = {
    query: getFirst(params.q)?.trim() ?? "",
    picker: getFirst(params.picker)?.trim() ?? "",
    packer: getFirst(params.packer)?.trim() ?? "",
    fulfillment: normalizeFulfillmentFilter(getFirst(params.fulfillment)),
    from: getFirst(params.from)?.trim() ?? "",
    to: getFirst(params.to)?.trim() ?? "",
    deliveryStatus: normalizeDeliveryFilter(
      getFirst(params.deliveryStatus),
    ),
  };
  const fromDate = parseJakartaDate(filters.from, false);
  const toDate = parseJakartaDate(filters.to, true);
  const readyPagination = getCursorPagination(params, "ready");
  const activePagination = getCursorPagination(params, "active");
  const completedPagination = getCursorPagination(params);
  const readyOrderWhere: Prisma.SalesOrderWhereInput = {
    status: { in: ["Confirmed", "Invoiced"] },
    approvalStatus: { in: ["Approved", "NotRequired"] },
    pickingList: { is: null },
    items: { some: {} },
    deliveryNotes: { none: {} },
    invoice: {
      is: { status: { not: "Cancelled" }, deliveryNotes: { none: {} } },
    },
  };
  const activePickingWhere: Prisma.PickingListWhereInput = {
    status: { in: ["Pending", "InProgress"] },
    deliveryNote: { is: null },
    deliverySource: { is: null },
  };
  const completedConditions: Prisma.PickingListWhereInput[] = [
    { status: "Packed" },
  ];
  if (filters.query) {
    completedConditions.push({
      OR: [
        { pickingListNumber: { contains: filters.query } },
        { salesOrder: { is: { orderNumber: { contains: filters.query } } } },
        {
          salesOrder: {
            is: { customerPoNumber: { contains: filters.query } },
          },
        },
        {
          salesOrder: {
            is: {
              customer: { is: { companyName: { contains: filters.query } } },
            },
          },
        },
      ],
    });
  }
  if (filters.picker) {
    completedConditions.push({
      pickerName: { contains: filters.picker },
    });
  }
  if (filters.packer) {
    completedConditions.push({
      packerName: { contains: filters.packer },
    });
  }
  if (filters.fulfillment === "full") {
    completedConditions.push({
      items: {
        none: { availabilityStatus: { in: ["Partial", "Unavailable"] } },
      },
    });
  }
  if (filters.fulfillment === "shortage") {
    completedConditions.push({
      items: {
        some: { availabilityStatus: { in: ["Partial", "Unavailable"] } },
      },
    });
  }
  if (fromDate || toDate) {
    completedConditions.push({
      packedAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    });
  }
  if (filters.deliveryStatus === "not-issued") {
    completedConditions.push({
      deliveryNote: { is: null },
      deliverySource: { is: null },
    });
  } else if (filters.deliveryStatus !== "all") {
    const statuses: DeliveryNoteStatus[] =
      filters.deliveryStatus === "open"
        ? ["Draft", "Issued"]
        : filters.deliveryStatus === "delivered"
          ? ["Delivered"]
          : ["Cancelled"];
    completedConditions.push({
      OR: [
        { deliveryNote: { is: { status: { in: statuses } } } },
        {
          deliverySource: {
            is: { deliveryNote: { is: { status: { in: statuses } } } },
          },
        },
      ],
    });
  }
  const completedWhere: Prisma.PickingListWhereInput = {
    AND: completedConditions,
  };
  const pickingListInclude = {
    items: true,
    deliveryNote: true,
    deliverySource: { include: { deliveryNote: true } },
    salesOrder: { include: { customer: true, invoice: true } },
  } satisfies Prisma.PickingListInclude;

  const [
    orderRecords,
    activePickingRecords,
    completedPickingRecords,
    readyCount,
    activeCount,
    completedCount,
    filteredCompletedCount,
    sourceReadyOrder,
  ] = await Promise.all([
    activeTab === "active"
      ? prisma.salesOrder.findMany({
          relationLoadStrategy: "join",
          where: readyOrderWhere,
          include: { customer: true, invoice: true },
          orderBy: [
            { requiredDate: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          ...getCursorArgs(readyPagination),
        })
      : Promise.resolve([]),
    activeTab === "active"
      ? prisma.pickingList.findMany({
          relationLoadStrategy: "join",
          where: activePickingWhere,
          include: pickingListInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...getCursorArgs(activePagination),
        })
      : Promise.resolve([]),
    activeTab === "completed"
      ? prisma.pickingList.findMany({
          relationLoadStrategy: "join",
          where: completedWhere,
          include: pickingListInclude,
          orderBy: [{ packedAt: "desc" }, { id: "desc" }],
          ...getCursorArgs(completedPagination),
        })
      : Promise.resolve([]),
    prisma.salesOrder.count({ where: readyOrderWhere }),
    prisma.pickingList.count({ where: activePickingWhere }),
    prisma.pickingList.count({ where: { status: "Packed" } }),
    prisma.pickingList.count({ where: completedWhere }),
    activeTab === "active" && sourceOrderId
      ? prisma.salesOrder.findFirst({
          where: { AND: [readyOrderWhere, { id: sourceOrderId }] },
          include: { customer: true, invoice: true },
        })
      : Promise.resolve(null),
  ]);
  const readyOrderPage = getCursorPage(orderRecords, readyPagination);
  const activePickingPage = getCursorPage(
    activePickingRecords,
    activePagination,
  );
  const completedPickingPage = getCursorPage(
    completedPickingRecords,
    completedPagination,
  );
  const readyOrders = readyOrderPage.items.filter((order) =>
    canCreatePickingList({
      ...order,
      hasPickingList: false,
      deliveryNoteCount: 0,
    }),
  );
  const readyOrderOptions =
    sourceReadyOrder &&
    !readyOrders.some((order) => order.id === sourceReadyOrder.id)
      ? [sourceReadyOrder, ...readyOrders]
      : readyOrders;
  const activePickingLists = activePickingPage.items
    .map((list) => ({
      ...list,
      deliveryNote: list.deliverySource?.deliveryNote ?? list.deliveryNote,
    }))
    .filter(
      (list) =>
        ["Pending", "InProgress"].includes(list.status) && !list.deliveryNote,
    );
  const visibleCompleted = completedPickingPage.items
    .map((list) => ({
      ...list,
      deliveryNote: list.deliverySource?.deliveryNote ?? list.deliveryNote,
    }))
    .filter((list) => {
      if (list.status !== "Packed") return false;
      const searchable = [
        list.pickingListNumber,
        list.salesOrder.orderNumber,
        list.salesOrder.customerPoNumber ?? "",
        list.salesOrder.customer.companyName,
      ]
        .join(" ")
        .toLocaleLowerCase();
      if (
        filters.query &&
        !searchable.includes(filters.query.toLocaleLowerCase())
      ) {
        return false;
      }
      if (
        filters.picker &&
        !(list.pickerName ?? "")
          .toLocaleLowerCase()
          .includes(filters.picker.toLocaleLowerCase())
      ) {
        return false;
      }
      if (
        filters.packer &&
        !(list.packerName ?? "")
          .toLocaleLowerCase()
          .includes(filters.packer.toLocaleLowerCase())
      ) {
        return false;
      }
      const hasShortage = list.items.some(
        (item) => item.availableQuantity < item.orderedQuantity,
      );
      if (filters.fulfillment === "full" && hasShortage) return false;
      if (filters.fulfillment === "shortage" && !hasShortage) return false;
      if (fromDate && (!list.packedAt || list.packedAt < fromDate)) return false;
      if (toDate && (!list.packedAt || list.packedAt > toDate)) return false;

      const deliveryStatus = list.deliveryNote?.status;
      if (
        filters.deliveryStatus === "not-issued" &&
        deliveryStatus !== undefined &&
        deliveryStatus !== null
      ) {
        return false;
      }
      if (
        filters.deliveryStatus === "open" &&
        !["Draft", "Issued"].includes(deliveryStatus ?? "")
      ) {
        return false;
      }
      if (
        filters.deliveryStatus === "delivered" &&
        deliveryStatus !== "Delivered"
      ) {
        return false;
      }
      if (
        filters.deliveryStatus === "cancelled" &&
        deliveryStatus !== "Cancelled"
      ) {
        return false;
      }
      return true;
    });

  const tabs = [
    {
      key: "active" as const,
      label: "Active",
      count: readyCount + activeCount,
    },
    {
      key: "completed" as const,
      label: "Completed",
      count: completedCount,
    },
  ];

  return (
    <>
      <PageHeader
        title="Pick & Pack"
        description="Create, verify, and review Picking Lists before orders move to Surat Jalan."
        action={
          canManage && activeTab === "active" ? (
            <Link
              href="/pick-pack?tab=active&mode=create"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Picking List
            </Link>
          ) : null
        }
      />
      <FlashMessage success={success} error={error} />

      <nav
        aria-label="Pick & Pack stages"
        className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-sm sm:inline-flex"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            aria-current={activeTab === tab.key ? "page" : undefined}
            href={`/pick-pack?tab=${tab.key}`}
            className={`inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-semibold ${
              activeTab === tab.key
                ? "bg-brand text-white"
                : "text-ink/80 hover:bg-soft"
            }`}
          >
            {tab.label}
            <span className="ml-2 rounded-md bg-canvas/20 px-1.5 py-0.5 text-xs">
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>

      {selectedForTab && (
        <PickingListPanel list={selectedForTab} canManage={canManage} />
      )}

      {activeTab === "active" ? (
        <>
          {(mode === "create" || sourceOrderId) && canManage && (
            <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
              <h2 className="mb-3 text-lg font-semibold">Add Picking List</h2>
              <p className="mb-3 text-sm text-ink/70">
                Select an approved order ready for fulfillment. Immediate
                Payment and Credit orders both need an active invoice; full
                payment is not required to start preparation.
              </p>
              {readyOrderOptions.length === 0 ? (
                <EmptyState message="No orders are ready for a new Picking List." />
              ) : (
                <form
                  action={createPickingList}
                  className="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)_auto]"
                >
                  <label className="min-w-64 flex-1 text-sm font-medium">
                    Sales Order / Customer PO
                    <select
                      name="salesOrderId"
                      required
                      defaultValue={
                        readyOrderOptions.some(
                          (order) => order.id === sourceOrderId,
                        )
                          ? sourceOrderId
                          : ""
                      }
                      className={`${inputClass} mt-1`}
                    >
                      <option value="" disabled>
                        Select order
                      </option>
                      {readyOrderOptions.map((order) => (
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
                  <label className="text-sm font-medium">
                    Picking PIC
                    <input
                      name="pickerName"
                      required
                      maxLength={120}
                      placeholder="Name of picking personnel"
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <button className={actionClass}>Create Picking List</button>
                </form>
              )}
            </section>
          )}

          <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-lg font-semibold">
              Ready for Picking List
            </h2>
            {readyOrders.length === 0 ? (
              <EmptyState message="No orders awaiting a Picking List." />
            ) : (
              <div className="overflow-x-auto">
                <table data-server-paginated="true">
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
                          {canManage ? (
                            <Link
                              className={actionClass}
                              href={`/pick-pack?tab=active&mode=create&salesOrderId=${order.id}`}
                            >
                              Set Picking PIC
                            </Link>
                          ) : (
                            <span className="text-ink/50">
                              Admin / Manager
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ServerPagination
              hasNext={readyOrderPage.hasNext}
              label="orders ready for picking"
              nextCursor={readyOrderPage.nextCursor}
              pathname="/pick-pack"
              searchParams={params}
              state={readyPagination}
            />
          </section>

          <section className="rounded-md border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-lg font-semibold">
              Active Picking Lists
            </h2>
            {activePickingLists.length === 0 ? (
              <EmptyState message="No Picking Lists in progress." />
            ) : (
              <div className="overflow-x-auto">
                <table data-server-paginated="true">
                  <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                    <tr>
                      <th className="py-3 pr-4">Picking List</th>
                      <th className="py-3 pr-4">Customer / Order</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Picking PIC</th>
                      <th className="py-3 pr-4">Packed / Available / Ordered</th>
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
                                ? "Ready to Prepare"
                                : "Preparing"
                            }
                          />
                        </td>
                        <td className="py-3 pr-4 text-ink/80">
                          {list.pickerName ?? "-"}
                        </td>
                        <td className="py-3 pr-4">
                          {list.items.reduce(
                            (sum, item) => sum + item.packedQuantity,
                            0,
                          )}{" "}
                          /{" "}
                          {list.items.reduce(
                            (sum, item) => sum + item.availableQuantity,
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
                              href={`/pick-pack?tab=active&view=${list.id}`}
                            >
                              View
                            </Link>
                            <Link
                              className={actionClass}
                              href={`/pick-pack/${list.id}/print`}
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
            <ServerPagination
              hasNext={activePickingPage.hasNext}
              label="active picking lists"
              nextCursor={activePickingPage.nextCursor}
              pathname="/pick-pack"
              searchParams={params}
              state={activePagination}
            />
          </section>
        </>
      ) : (
        <>
          <section className="mb-6 rounded-md border border-line bg-white p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  Completed Picking Lists
                </h2>
                <p className="mt-1 text-sm text-ink/70">
                  Prepared lists are read-only. Reopen is available only before
                  a Surat Jalan is issued.
                </p>
              </div>
              <p className="text-sm font-medium text-ink/70">
                {filteredCompletedCount} result
                {filteredCompletedCount === 1 ? "" : "s"}
              </p>
            </div>
            <form
              method="get"
              className="grid gap-3 rounded-md border border-line bg-soft p-4 md:grid-cols-2 xl:grid-cols-8"
            >
              <input type="hidden" name="tab" value="completed" />
              <label className="text-sm font-medium xl:col-span-2">
                Search
                <input
                  name="q"
                  defaultValue={filters.query}
                  placeholder="Picking List, SO, PO, customer"
                  className={`${inputClass} mt-1 bg-white`}
                />
              </label>
              <label className="text-sm font-medium">
                Picking PIC
                <input
                  name="picker"
                  defaultValue={filters.picker}
                  placeholder="Picking PIC"
                  className={`${inputClass} mt-1 bg-white`}
                />
              </label>
              <label className="text-sm font-medium">
                Packing PIC
                <input
                  name="packer"
                  defaultValue={filters.packer}
                  placeholder="Packing PIC"
                  className={`${inputClass} mt-1 bg-white`}
                />
              </label>
              <label className="text-sm font-medium">
                Fulfillment
                <select
                  name="fulfillment"
                  defaultValue={filters.fulfillment}
                  className={`${inputClass} mt-1 bg-white`}
                >
                  <option value="all">All</option>
                  <option value="full">Fully packed</option>
                  <option value="shortage">With shortage</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Completed from
                <input
                  name="from"
                  type="date"
                  defaultValue={filters.from}
                  className={`${inputClass} mt-1 bg-white`}
                />
              </label>
              <label className="text-sm font-medium">
                Completed to
                <input
                  name="to"
                  type="date"
                  defaultValue={filters.to}
                  className={`${inputClass} mt-1 bg-white`}
                />
              </label>
              <label className="text-sm font-medium">
                Surat Jalan
                <select
                  name="deliveryStatus"
                  defaultValue={filters.deliveryStatus}
                  className={`${inputClass} mt-1 bg-white`}
                >
                  <option value="all">All</option>
                  <option value="not-issued">Not issued</option>
                  <option value="open">Open</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-8">
                <button className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white">
                  Apply Filters
                </button>
                <Link
                  href="/pick-pack?tab=completed"
                  className={actionClass}
                >
                  Reset
                </Link>
              </div>
            </form>
          </section>

          <section className="rounded-md border border-line bg-white p-5 shadow-card">
            {visibleCompleted.length === 0 ? (
              <EmptyState message="No completed Picking Lists match these filters." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table data-server-paginated="true">
                    <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
                      <tr>
                        <th className="py-3 pr-4">Picking List</th>
                        <th className="py-3 pr-4">Completed</th>
                        <th className="py-3 pr-4">Customer / Order</th>
                        <th className="py-3 pr-4">Picking PIC</th>
                        <th className="py-3 pr-4">Packing PIC</th>
                        <th className="py-3 pr-4">Fulfillment</th>
                        <th className="py-3 pr-4">Surat Jalan</th>
                        <th className="py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-sm">
                      {visibleCompleted.map((list) => (
                        <tr key={list.id}>
                          <td className="py-3 pr-4 font-medium">
                            {list.pickingListNumber}
                          </td>
                          <td className="py-3 pr-4 text-ink/80">
                            {list.packedAt
                              ? formatDateTime(list.packedAt)
                              : "-"}
                          </td>
                          <td className="py-3 pr-4">
                            {list.salesOrder.customer.companyName}
                            <p className="text-xs text-ink/70">
                              {list.salesOrder.orderNumber}
                              {list.salesOrder.customerPoNumber
                                ? ` · PO ${list.salesOrder.customerPoNumber}`
                                : ""}
                            </p>
                          </td>
                          <td className="py-3 pr-4 text-ink/80">
                            {list.pickerName ?? "-"}
                          </td>
                          <td className="py-3 pr-4 text-ink/80">
                            {list.packerName ?? "-"}
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              status={
                                list.items.some(
                                  (item) =>
                                    item.availableQuantity <
                                    item.orderedQuantity,
                                )
                                  ? "Shortage"
                                  : "Fully Packed"
                              }
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge
                              status={
                                list.deliveryNote?.status ??
                                "Awaiting Surat Jalan"
                              }
                            />
                          </td>
                          <td className="py-3">
                            <div className="flex gap-2">
                              <Link
                                className={actionClass}
                                href={completedHref(filters, list.id)}
                              >
                                View
                              </Link>
                              <Link
                                className={actionClass}
                                href={`/pick-pack/${list.id}/print`}
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

              </>
            )}
            <ServerPagination
              hasNext={completedPickingPage.hasNext}
              label="completed picking lists"
              nextCursor={completedPickingPage.nextCursor}
              pathname="/pick-pack"
              searchParams={params}
              state={completedPagination}
            />
          </section>
        </>
      )}
    </>
  );
}

type FulfillmentFilter = "all" | "full" | "shortage";

function normalizeFulfillmentFilter(
  value: string | undefined,
): FulfillmentFilter {
  return ["full", "shortage"].includes(value ?? "")
    ? (value as FulfillmentFilter)
    : "all";
}

type DeliveryFilter =
  | "all"
  | "not-issued"
  | "open"
  | "delivered"
  | "cancelled";

function normalizeDeliveryFilter(value: string | undefined): DeliveryFilter {
  return ["not-issued", "open", "delivered", "cancelled"].includes(value ?? "")
    ? (value as DeliveryFilter)
    : "all";
}

function parseJakartaDate(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function completedHref(
  filters: {
    query: string;
    picker: string;
    packer: string;
    fulfillment: FulfillmentFilter;
    from: string;
    to: string;
    deliveryStatus: DeliveryFilter;
  },
  view: string,
) {
  const query = new URLSearchParams({ tab: "completed" });
  if (filters.query) query.set("q", filters.query);
  if (filters.picker) query.set("picker", filters.picker);
  if (filters.packer) query.set("packer", filters.packer);
  if (filters.fulfillment !== "all") {
    query.set("fulfillment", filters.fulfillment);
  }
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.deliveryStatus !== "all") {
    query.set("deliveryStatus", filters.deliveryStatus);
  }
  query.set("view", view);
  return `/pick-pack?${query.toString()}`;
}

function getFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
