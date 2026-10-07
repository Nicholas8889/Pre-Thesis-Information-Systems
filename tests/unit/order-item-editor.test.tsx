import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/order-item-edit-actions", () => ({ previewSalesOrderItemChanges: vi.fn(), saveSalesOrderItemChanges: vi.fn() }));
import { OrderItemEditor } from "../../src/components/order-item-editor";
import { DocumentRevisionBadge } from "../../src/components/document-revision-badge";

const item = { id: "row", productId: "product", itemName: "Stored Product", quantity: 2,
  baseUnitPrice: 100, markupPercent: 20, discountPercent: 0, finalUnitPrice: 120, subtotal: 240 };
describe("inline item editor initial view", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => vi.unstubAllGlobals());
  it("preserves the existing item table and adds only an edit control", () => {
    const html = renderToStaticMarkup(<OrderItemEditor id="order" version={1} orderNumber="SO-1" orderLabel="Sales Order"
      items={[item]} products={[]} notes="Original note" eligibility={{ allowed: true, code: "EDITABLE", message: "Allowed" }} />);
    for (const text of ["Item Details", "Stored Product", "Base Unit Price", "Final Unit Price", "Edit Barang", "Original note"]) expect(html).toContain(text);
    expect(html).not.toContain('type="number"'); expect(html).not.toContain("<select");
    expect(html).not.toContain("Simpan Perubahan");
  });
  it("keeps a locked edit button visible with an accessible reason", () => {
    const html = renderToStaticMarkup(<OrderItemEditor id="order" version={1} orderNumber="PO-1" orderLabel="Customer PO"
      items={[item]} products={[]} notes={null} eligibility={{ allowed: false, code: "PACK_STARTED", message: "Pack already started" }} />);
    expect(html).toContain('disabled=""'); expect(html).toContain('aria-describedby="item-edit-lock-order"');
    expect(html).toContain("Pack already started");
  });
  it("shows a revision badge only for revised documents", () => {
    expect(renderToStaticMarkup(<DocumentRevisionBadge revisionNumber={1} />)).toBe("");
    expect(renderToStaticMarkup(<DocumentRevisionBadge />)).toBe("");
    expect(renderToStaticMarkup(<DocumentRevisionBadge revisionNumber={2} />)).toContain("Revisi 2");
  });
});
