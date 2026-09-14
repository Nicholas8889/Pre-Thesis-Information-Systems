import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  orders: vi.fn(),
  lists: vi.fn(),
  notes: vi.fn(),
  list: vi.fn(),
  note: vi.fn(),
  user: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesOrder: { findMany: mocks.orders },
    pickingList: { findMany: mocks.lists, findUnique: mocks.list },
    deliveryNote: { findMany: mocks.notes, findUnique: mocks.note },
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
}));
import { CombinedDeliveryNoteForm } from "../../src/components/combined-delivery-note-form";
import DeliveryPrintPage from "../../src/app/surat-jalan/[deliveryNoteId]/print/page";
import WarehousePage from "../../src/app/surat-jalan/page";
import PrintPage from "../../src/app/surat-jalan/picking-list/[pickingListId]/print/page";
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
      pickedQuantity: 10,
      packedQuantity: 10,
      notes: null,
    },
  ],
};
const notes = ["Issued", "Delivered", "Cancelled"].map((status) => ({
  id: status,
  status,
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
    mocks.note.mockResolvedValue(null);
    mocks.list.mockResolvedValue(list);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps Packed in picking until Surat Jalan exists and provides the module-level add action", async () => {
    const html = renderToStaticMarkup(await WarehousePage({}));
    expect(html).toContain("Picking &amp; Packing");
    expect(html).toContain("Add Picking List");
    expect(html).toContain("SO-READY");
    expect(html).toContain("PL-PACKED");
    expect(html).not.toContain("PL-ALREADY-ISSUED");
    expect(html).not.toContain("Add Surat Jalan");
    expect(html).toMatch(/Completed<span[^>]*>1<\/span>/);
  });
  it.each(["Unpaid", "Partial"])("offers an Immediate Payment %s order for picking and packed shipment", async status => {
    const immediateOrder = { ...order, orderNumber: "SO-IMMEDIATE", paymentTermType: "IMMEDIATE", creditTermMonths: null, invoice: { status, paymentTermType: "IMMEDIATE" } };
    mocks.orders.mockResolvedValue([immediateOrder]);
    mocks.lists.mockResolvedValue([]);
    const html = renderToStaticMarkup(await WarehousePage({ searchParams: Promise.resolve({ mode: "create" }) }));
    expect(html).toContain("SO-IMMEDIATE");
    expect(html).toContain('<option value="order">');
    expect(html).not.toContain("must be paid");
    const packed = { ...list, salesOrder: immediateOrder };
    const panel = renderToStaticMarkup(<PickingListPanel list={packed as unknown as Parameters<typeof PickingListPanel>[0]["list"]} canManage showIssueForm={false} />);
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
        await WarehousePage({ searchParams: Promise.resolve(params) }),
      );
      expect(html).toContain(expected);
      for (const label of excluded) expect(html).not.toContain(label);
    },
  );
  it("locks a Packed list and offers Surat Jalan only after verification", () => {
    const html = renderToStaticMarkup(
      <PickingListPanel
        list={list as unknown as Parameters<typeof PickingListPanel>[0]["list"]}
        canManage
        showIssueForm={false}
      />,
    );
    expect(html).toContain("Create Surat Jalan");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Mark Packed");
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
        showIssueForm={false}
      />,
    );
    expect(pending).toContain("Mark Packed");
    expect(pending).not.toContain("Create Surat Jalan");
  });
  it("prints quantities, discrepancy fields and signatures without financial data", async () => {
    const html = renderToStaticMarkup(
      await PrintPage({ params: Promise.resolve({ pickingListId: list.id }) }),
    );
    for (const label of [
      "PICK &amp; PACK SHEET",
      "Packing Product",
      "Ordered (PCS)",
      "Picked",
      "Packed",
      "Discrepancy / Notes",
      "Package count / Koli",
      "Picker",
      "Packer",
    ])
      expect(html).toContain(label);
    for (const label of ["Unit Price", "Subtotal", "Discount", "PPN", "Rp"])
      expect(html).not.toContain(label);
  });
  it("offers only the selected customer's packed orders in the combined form", () => {
    const candidates = [
      list,
      { ...list, id: "po-list", salesOrder: { ...order, orderNumber: "SO-PO", customerPoNumber: "PO-SECOND" } },
      { ...list, id: "other-list", salesOrder: { ...order, customerId: "other", orderNumber: "SO-OTHER", customer: { ...order.customer, id: "other", companyName: "Other Customer" } } }
    ];
    const html = renderToStaticMarkup(<CombinedDeliveryNoteForm lists={candidates as never} initialPickingListId={list.id} />);
    expect(html).toMatch(/name="pickingListId"[^>]*value="packed-list"/);
    expect(html).toContain("PO-SECOND");
    expect(html).not.toContain("SO-OTHER");
    expect(html).toContain("invoices stay separate");
    expect(html).toContain('name="recipientAddress"');
  });
  it("removes every Picking List linked through a combined SJ from the active queue", async () => {
    mocks.lists.mockResolvedValue([{ ...list, deliverySource: { deliveryNote: notes[0] } }]);
    const html = renderToStaticMarkup(await WarehousePage({}));
    expect(html).not.toContain("PL-PACKED");
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
        { id: "b", itemName: "Item B", quantity: 8, unit: "PCS", source: { salesOrder: second } }
      ]
    });
    const html = renderToStaticMarkup(await DeliveryPrintPage({ params: Promise.resolve({ deliveryNoteId: "Issued" }) }));
    for (const ref of ["SO-COMBINED-A", "PO-COMBINED-B", "INV-COMBINED-A", "INV-COMBINED-B", "Item A", "Item B"]) expect(html).toContain(ref);
    expect(html).toMatch(/<tr[^>]*>[^]*?SO-COMBINED-A[^]*?Item A/);
    expect(html).not.toContain("Unit Price");
  });

});
