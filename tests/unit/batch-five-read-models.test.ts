import { describe, expect, it } from "vitest";
import {
  buildCustomerOrderBy,
  buildCustomerWhere,
  getNpwpSearchCandidate,
  parseCustomerListFilters,
} from "../../src/lib/customer-query";
import {
  buildReceivableOrderBy,
  buildReceivableWhere,
  parseReceivableFilters,
} from "../../src/lib/receivable-query";
import {
  buildDeliveryNoteOrderBy,
  buildDeliveryNoteWhere,
  parseDeliveryNoteListFilters,
} from "../../src/lib/delivery-note-query";
import {
  buildOutreachCustomerWhere,
  OUTREACH_LATEST_ORDER,
} from "../../src/lib/outreach-query";
import {
  encodeReferenceSnapshot,
  getDeliveryInvoiceReferences,
  getDeliveryOrderReferences,
  parseReferenceSnapshot,
} from "../../src/lib/delivery-note-references";
import { withAllowedSearchParams } from "../../src/lib/legacy-route";
import { createProcessTabHref } from "../../src/components/process-tabs";

describe("Batch 5 read-model query boundaries", () => {
  it.each([
    ["123456789012345", "123456789012345"],
    ["12.345.678.9-012.345", "123456789012345"],
    ["1234567890123456", "1234567890123456"],
    ["1234 5678 9012 3456", "1234567890123456"],
  ])("recognizes canonical and formatted NPWP %s", (query, expected) => {
    expect(getNpwpSearchCandidate(query)).toBe(expected);
  });

  it.each(["", "1234", "ABC-123456789012345", "+62 812 3456 7890"])(
    "does not reinterpret non-NPWP search %s",
    query => expect(getNpwpSearchCandidate(query)).toBeNull(),
  );

  it("combines customer search, status, and portfolio scope before pagination", () => {
    const filters = parseCustomerListFilters({
      query: "12.345.678.9-012.345",
      status: "Inactive",
      sort: "createdAt",
      direction: "desc",
    });
    expect(buildCustomerWhere(filters, { portfolioOwnerUserId: "sales-a" })).toEqual({
      AND: [
        { portfolioOwnerUserId: "sales-a" },
        { status: "Inactive" },
        { OR: expect.arrayContaining([{ npwp: { equals: "123456789012345" } }]) },
      ],
    });
    expect(buildCustomerOrderBy(filters)).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("normalizes unknown customer params without exposing arbitrary columns", () => {
    expect(parseCustomerListFilters({ status: "Deleted", sort: "password", direction: "sideways" }))
      .toEqual({ query: "", status: "ALL", sort: "company", direction: "asc" });
  });

  it("builds receivable search/status inside portfolio scope and stable numeric sort", () => {
    const filters = parseReceivableFilters({
      tab: "ongoing",
      status: "Partial",
      query: "東京",
      sort: "amount",
      direction: "desc",
    });
    expect(buildReceivableWhere(filters, new Date("2026-09-28T00:00:00Z"), {
      salesOrder: { createdByUserId: "sales-a" },
    })).toMatchObject({ AND: expect.any(Array) });
    expect(buildReceivableOrderBy(filters)).toEqual([
      { remainingAmount: "desc" },
      { id: "desc" },
    ]);
  });

  it("normalizes invalid receivable tab, status, sort, and direction", () => {
    expect(parseReceivableFilters({
      tab: "secret",
      status: "Paid",
      sort: "raw_sql",
      direction: "random",
    })).toEqual({
      tab: "ongoing",
      status: null,
      query: "",
      sort: "dueDate",
      direction: "asc",
    });
  });

  it("builds typed delivery filters and rejects ambiguous dates", () => {
    const invalid = parseDeliveryNoteListFilters({
      startDate: "2026-02-30",
      endDate: "2026-09-28T00:00:00Z",
      status: "Unknown",
      sort: "drop table",
      direction: "sideways",
    });
    expect(invalid).toMatchObject({
      startDate: null,
      endDate: null,
      status: null,
      sort: "createdAt",
      direction: "desc",
    });

    const valid = parseDeliveryNoteListFilters({
      query: "INV-東京",
      customerId: "customer-a",
      status: "Issued",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      sort: "date",
      direction: "asc",
    });
    expect(buildDeliveryNoteWhere(valid, ["Draft", "Issued"], { customerId: "customer-a" }))
      .toMatchObject({ AND: expect.any(Array) });
    expect(buildDeliveryNoteOrderBy(valid)).toEqual([
      { deliveryDate: "asc" },
      { id: "asc" },
    ]);
  });

  it("keeps outreach Unicode-note search inside portfolio scope with deterministic latest order", () => {
    const where = buildOutreachCustomerWhere("東京", { portfolioOwnerUserId: "sales-a" });
    expect(where).toEqual({
      AND: [
        { portfolioOwnerUserId: "sales-a" },
        { OR: expect.arrayContaining([
          { outreachActivities: { some: { notes: { contains: "東京", mode: "insensitive" } } } },
        ]) },
      ],
    });
    expect(OUTREACH_LATEST_ORDER).toEqual([
      { contactDate: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("keeps only the Customer PO legacy query allowlist", () => {
    expect(withAllowedSearchParams(
      "/customer-purchase-orders",
      { q: "PO 東京", tab: "done", paymentTermType: "CREDIT", admin: "true", cursor: "stale" },
      ["q", "tab", "paymentTermType"],
    )).toBe("/customer-purchase-orders?q=PO+%E6%9D%B1%E4%BA%AC&tab=done&paymentTermType=CREDIT");
  });

  it("preserves canonical filters when navigating process tabs", () => {
    expect(createProcessTabHref(
      "/receivables",
      "done",
      { q: "INV-1", sort: "amount", direction: "desc", cursor: "row-20" },
      ["q", "sort", "direction"],
    )).toBe("/receivables?q=INV-1&sort=amount&direction=desc&tab=done");
  });

  it("returns canonical links and snapshot-only labels for delivery references", () => {
    const live = {
      orderReferencesSnapshot: "[]",
      invoiceReferencesSnapshot: "[]",
      sources: [{
        salesOrder: { id: "so-1", source: "CUSTOMER_PO", orderNumber: "SO-1", customerPoNumber: "PO-1" },
        invoice: { id: "inv-1", invoiceNumber: "INV-1" },
      }],
    };
    expect(getDeliveryOrderReferences(live)).toEqual([
      { label: "PO-1 / SO-1", href: "/customer-purchase-orders/so-1" },
    ]);
    expect(getDeliveryInvoiceReferences(live)).toEqual([
      { label: "INV-1", href: "/invoices?view=inv-1" },
    ]);

    const historical = {
      orderReferencesSnapshot: encodeReferenceSnapshot(["PO-OLD / SO-OLD"]),
      invoiceReferencesSnapshot: encodeReferenceSnapshot(["INV-OLD"]),
    };
    expect(parseReferenceSnapshot(historical.orderReferencesSnapshot)).toEqual(["PO-OLD / SO-OLD"]);
    expect(getDeliveryOrderReferences(historical)).toEqual([
      { label: "PO-OLD / SO-OLD", href: null },
    ]);
    expect(getDeliveryInvoiceReferences(historical)).toEqual([
      { label: "INV-OLD", href: null },
    ]);
  });
});
