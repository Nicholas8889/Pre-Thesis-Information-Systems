import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  orders: vi.fn(),
  order: vi.fn(),
  orderCount: vi.fn(),
  lists: vi.fn(),
  listCount: vi.fn(),
  notes: vi.fn(),
  noteFirst: vi.fn(),
  noteCount: vi.fn(),
  list: vi.fn(),
  note: vi.fn(),
  user: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOrder: {
      findMany: mocks.orders,
      findFirst: mocks.order,
      count: mocks.orderCount,
    },
    pickingList: {
      findMany: mocks.lists,
      findUnique: mocks.list,
      count: mocks.listCount,
    },
    deliveryNote: {
      findMany: mocks.notes,
      findFirst: mocks.noteFirst,
      findUnique: mocks.note,
      count: mocks.noteCount,
    },
  },
}));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/actions", () => ({
  createDeliveryNote: vi.fn(),
  updateDeliveryNoteStatus: vi.fn(),
}));
vi.mock("@/lib/picking-list-actions", () => ({
  createPickingList: vi.fn(),
  savePickingList: vi.fn(),
  reopenPickingList: vi.fn(),
}));
import { CombinedDeliveryNoteForm } from "../../src/components/combined-delivery-note-form";
import DeliveryPrintPage from "../../src/app/surat-jalan/[deliveryNoteId]/print/page";
import SuratJalanPage from "../../src/app/surat-jalan/page";
import PickPackPage from "../../src/app/pick-pack/page";
import PrintPage from "../../src/app/pick-pack/[pickingListId]/print/page";
import { PickingListPanel } from "../../src/components/picking-list-panel";
const order = {
  id: "order",
  orderNumber: "SO-READY",
  customerPoNumber: null,
  customerId: "customer",
  status: "Invoiced",
  approvalStatus: "Approved",
  requiredDate: null,
  paymentTermType: "CREDIT",
  creditTermMonths: 1,
  customer: {
    id: "customer",
    companyName: "Warehouse Customer",
    name: "Contact",
    address: "Destination",
    phone: "",
  },
  invoice: { status: "Unpaid", paymentTermType: "CREDIT" },
};
const list = {
  id: "packed-list",
  pickingListNumber: "PL-PACKED",
  status: "Packed",
  salesOrderId: "order",
  salesOrder: order,
  pickerName: "Picker",
  packerName: "Packer",
  packageCount: 1,
  packedAt: new Date("2026-09-12"),
  createdAt: new Date("2026-09-12"),
  updatedAt: new Date("2026-09-12"),
  notes: null,
  deliveryNote: null,
  items: [
    {
      id: "line",
      salesOrderItemId: "source-line",
      itemName: "Packing Product",
      orderedQuantity: 10,
      availableQuantity: 10,
      packedQuantity: 10,
      availabilityStatus: "Available",
      notes: null,
    },
  ],
};
const notes = ["Issued", "Delivered", "Cancelled"].map((status) => ({
  id: status,
  status,
  issuedAt: status === "Issued" || status === "Delivered" ? new Date("2026-09-12") : null,
  deliveryNoteNumber: `SJ-${status.toUpperCase()}`,
  deliveryDate: new Date("2026-09-12"),
  recipientName: "Recipient",
  invoice: null,
  notes: null,
}));

describe("warehouse tabs and print views", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ role: "ADMIN" });
    mocks.order.mockResolvedValue(null);
    mocks.orderCount.mockResolvedValue(1);
    mocks.orders.mockResolvedValue([order]);
    mocks.lists.mockResolvedValue([
      list,
      {
        ...list,
        id: "issued-list",
        pickingListNumber: "PL-ALREADY-ISSUED",
        deliveryNote: notes[0],
      },
    ]);
    mocks.notes.mockResolvedValue(notes);
    mocks.noteFirst.mockResolvedValue(null);
    mocks.noteCount.mockResolvedValue(1);
    mocks.note.mockResolvedValue(null);
    mocks.list.mockResolvedValue(list);
    mocks.listCount.mockImplementation(async ({ where }) =>
      Array.isArray(where?.status?.in) ? 0 : 2,
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("separates Active work from Completed Picking Lists", async () => {
    const activeHtml = renderToStaticMarkup(await PickPackPage({}));
    expect(activeHtml).toContain("Pick &amp; Pack");
    expect(activeHtml).toContain("Active");
    expect(activeHtml).toContain("Completed");
    expect(activeHtml).toContain("Add Picking List");
    expect(activeHtml).toContain("SO-READY");
    expect(activeHtml).not.toContain("PL-PACKED");
    expect(activeHtml).not.toContain("PL-ALREADY-ISSUED");

    const completedHtml = renderToStaticMarkup(
      await PickPackPage({
        searchParams: Promise.resolve({ tab: "completed" }),
      }),
    );
    expect(completedHtml).toContain("Completed Picking Lists");
    expect(completedHtml).toContain("PL-PACKED");
    expect(completedHtml).toContain("PL-ALREADY-ISSUED");
    expect(completedHtml).not.toContain("Add Picking List");

    const deliveryHtml = renderToStaticMarkup(await SuratJalanPage({}));
    expect(deliveryHtml).toContain("Surat Jalan");
    expect(deliveryHtml).toContain("Dikirim");
    expect(deliveryHtml).toContain("Tandai Sudah Diterima");
    expect(deliveryHtml).not.toContain("Edit Status");
    expect(deliveryHtml).not.toContain("Add Picking List");
    expect(deliveryHtml).toMatch(/Completed<span[^>]*>1<\/span>/);
  });
  it.each(["Unpaid", "Partial"])("offers an Immediate Payment %s order for picking and packed shipment", async status => {
    const immediateOrder = { ...order, orderNumber: "SO-IMMEDIATE", paymentTermType: "IMMEDIATE", creditTermMonths: null, invoice: { status, paymentTermType: "IMMEDIATE" } };
    mocks.orders.mockResolvedValue([immediateOrder]);
    mocks.lists.mockResolvedValue([]);
    const html = renderToStaticMarkup(await PickPackPage({ searchParams: Promise.resolve({ mode: "create" }) }));
    expect(html).toContain("SO-IMMEDIATE");
    expect(html).toContain('<option value="order">');
    expect(html).not.toContain("must be paid");
    const packed = { ...list, salesOrder: immediateOrder };
    const panel = renderToStaticMarkup(<PickingListPanel list={packed as unknown as Parameters<typeof PickingListPanel>[0]["list"]} canManage />);
    expect(panel).toContain("Create Surat Jalan");
  });
  it.each([
    [{ tab: "open" }, "SJ-ISSUED", ["SJ-DELIVERED", "SJ-CANCELLED"]],
    [{ tab: "completed" }, "SJ-DELIVERED", ["SJ-ISSUED", "SJ-CANCELLED"]],
    [
      { tab: "completed", archive: "cancelled" },
      "SJ-CANCELLED",
      ["SJ-ISSUED", "SJ-DELIVERED"],
    ],
  ] as const)(
    "isolates documents for %o",
    async (params, expected, excluded) => {
      const html = renderToStaticMarkup(
        await SuratJalanPage({ searchParams: Promise.resolve(params) }),
      );
      expect(html).toContain(expected);
      for (const label of excluded) expect(html).not.toContain(label);
    },
  );
  it("locks a Prepared list and offers Surat Jalan only after verification", () => {
    const html = renderToStaticMarkup(
      <PickingListPanel
        list={list as unknown as Parameters<typeof PickingListPanel>[0]["list"]}
        canManage
      />,
    );
    expect(html).toContain("Create Surat Jalan");
    expect(html).toContain("Reopen");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Complete Pick & Pack");
    const linked = renderToStaticMarkup(
      <PickingListPanel
        list={
          {
            ...list,
            deliveryNote: notes[0],
          } as unknown as Parameters<typeof PickingListPanel>[0]["list"]
        }
        canManage
      />,
    );
    expect(linked).toContain("View Surat Jalan");
    expect(linked).not.toContain("Reopen");
    const pending = renderToStaticMarkup(
      <PickingListPanel
        list={
          {
            ...list,
            status: "Pending",
            packedAt: null,
          } as unknown as Parameters<typeof PickingListPanel>[0]["list"]
        }
        canManage
      />,
    );
    expect(pending).toContain("Complete Pick &amp; Pack");
    expect(pending).not.toContain("Create Surat Jalan");
    expect(pending).not.toContain("Reopen");
    expect(pending).toContain('name="availability_line"');
    expect(pending).toContain('name="available_line"');
    expect(pending).toContain('name="packed_line"');
    expect(pending).toContain("Picking PIC");
    expect(pending).toContain("Packing PIC");
    expect(pending).toContain("Shortage");
    expect(pending).not.toContain("Package count / Koli");
  });
  it("prints quantities, discrepancy fields and signatures without financial data", async () => {
    const html = renderToStaticMarkup(
      await PrintPage({ params: Promise.resolve({ pickingListId: list.id }) }),
    );
    for (const label of [
      "PICKING LIST",
      "Packing Product",
      "Ordered",
      "Availability",
      "Available",
      "Packed",
      "Shortage",
      "Operational notes",
      "Picking PIC",
      "Packing PIC",
    ])
      expect(html).toContain(label);
    for (const label of ["Package count / Koli", "Unit Price", "Subtotal", "Discount", "PPN", "Rp"])
      expect(html).not.toContain(label);
  });
  it("offers only the selected customer's prepared orders in the combined form", () => {
    const candidates = [
      list,
      { ...list, id: "po-list", items: list.items.map(item => ({ ...item, id: "po-" + item.id })), salesOrder: { ...order, orderNumber: "SO-PO", customerPoNumber: "PO-SECOND" } },
      { ...list, id: "other-list", items: list.items.map(item => ({ ...item, id: "other-" + item.id })), salesOrder: { ...order, customerId: "other", orderNumber: "SO-OTHER", customer: { ...order.customer, id: "other", companyName: "Other Customer" } } }
    ];
    const html = renderToStaticMarkup(<CombinedDeliveryNoteForm lists={candidates as never} initialPickingListId={list.id} />);
    expect(html).toMatch(/name="pickingListId"[^>]*value="packed-list"/);
    expect(html).toContain("PO-SECOND");
    expect(html).not.toContain("SO-OTHER");
    expect(html).toContain("invoices stay separate");
    expect(html).toContain('name="recipientAddress"');
    expect(html).not.toContain("koli");
  });
  it("keeps Picking Lists linked through a combined SJ in Completed history", async () => {
    mocks.lists.mockResolvedValue([{ ...list, deliverySource: { deliveryNote: notes[0] } }]);
    const activeHtml = renderToStaticMarkup(await PickPackPage({}));
    expect(activeHtml).not.toContain("PL-PACKED");
    const completedHtml = renderToStaticMarkup(
      await PickPackPage({ searchParams: Promise.resolve({ tab: "completed" }) }),
    );
    expect(completedHtml).toContain("PL-PACKED");
  });

  it("filters Completed by search, picker, date, and Surat Jalan state", async () => {
    const searchHtml = renderToStaticMarkup(
      await PickPackPage({
        searchParams: Promise.resolve({
          tab: "completed",
          q: "ALREADY-ISSUED",
          picker: "Picker",
          from: "2026-09-01",
          to: "2026-09-30",
          deliveryStatus: "open",
        }),
      }),
    );
    expect(searchHtml).toContain("PL-ALREADY-ISSUED");
    expect(searchHtml).not.toContain(">PL-PACKED<");

    const emptyHtml = renderToStaticMarkup(
      await PickPackPage({
        searchParams: Promise.resolve({
          tab: "completed",
          from: "2026-09-13",
        }),
      }),
    );
    expect(emptyHtml).toContain(
      "No completed Picking Lists match these filters.",
    );
  });

  it("paginates Completed Picking Lists", async () => {
    const completedRecords = Array.from({ length: 21 }, (_, index) => ({
        ...list,
        id: `completed-${index + 1}`,
        pickingListNumber: `PL-COMPLETE-${index + 1}`,
      }));
    mocks.lists
      .mockResolvedValueOnce(completedRecords)
      .mockResolvedValueOnce([completedRecords[20]]);
    const firstPage = renderToStaticMarkup(
      await PickPackPage({
        searchParams: Promise.resolve({ tab: "completed" }),
      }),
    );
    expect(firstPage).toContain("PL-COMPLETE-1");
    expect(firstPage).not.toContain("PL-COMPLETE-21");
    expect(firstPage).toContain("Page 1");

    const secondPage = renderToStaticMarkup(
      await PickPackPage({
        searchParams: Promise.resolve({
          tab: "completed",
          cursor: "completed-20",
          cursorHistory: "~",
        }),
      }),
    );
    expect(secondPage).toContain("PL-COMPLETE-21");
    expect(secondPage).not.toContain(">PL-COMPLETE-1<");
    expect(secondPage).toContain("Page 2");
  });

  it("prints each source reference beside its own items and all invoices", async () => {
    const first = { ...order, orderNumber: "SO-COMBINED-A" };
    const second = { ...order, orderNumber: "SO-COMBINED-B", customerPoNumber: "PO-COMBINED-B" };
    mocks.note.mockResolvedValue({
      ...notes[0], customer: order.customer, salesOrder: null, invoice: null,
      sources: [
        { salesOrder: first, invoice: { invoiceNumber: "INV-COMBINED-A" } },
        { salesOrder: second, invoice: { invoiceNumber: "INV-COMBINED-B" } }
      ],
      items: [
        { id: "a", itemName: "Item A", quantity: 10, unit: "PCS", source: { salesOrder: first } },
        { id: "b", itemName: "Item B", quantity: 8, unit: "PCS", source: { salesOrder: second } },
        { id: "removed", itemName: "Removed Draft Item", quantity: 0, unit: "PCS", source: { salesOrder: second } }
      ]
    });
    const html = renderToStaticMarkup(await DeliveryPrintPage({ params: Promise.resolve({ deliveryNoteId: "Issued" }) }));
    for (const ref of ["SO-COMBINED-A", "PO-COMBINED-B", "INV-COMBINED-A", "INV-COMBINED-B", "Item A", "Item B"]) expect(html).toContain(ref);
    expect(html).toMatch(/<tr[^>]*>[^]*?SO-COMBINED-A[^]*?Item A/);
    expect(html).not.toContain("Unit Price");
    expect(html).not.toContain("Removed Draft Item");
  });

  it("blocks printing an unissued Draft", async () => {
    mocks.note.mockResolvedValue({
      ...notes[0],
      status: "Draft",
      issuedAt: null,
      customer: order.customer,
      salesOrder: order,
      invoice: null,
      sources: [],
      items: [],
    });
    await expect(
      DeliveryPrintPage({ params: Promise.resolve({ deliveryNoteId: "Draft" }) }),
    ).rejects.toThrow("404");
  });

});
