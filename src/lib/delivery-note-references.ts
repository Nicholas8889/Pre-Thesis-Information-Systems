import { orderReference } from "@/lib/delivery-note-links";

type Reference = { label: string; href: string | null };
type SourceReference = {
  salesOrder: { id: string; source: string; orderNumber: string; customerPoNumber?: string | null };
  invoice: { id: string; invoiceNumber: string };
};

type DeliveryReferenceInput = {
  orderReferencesSnapshot: string;
  invoiceReferencesSnapshot: string;
  sources?: SourceReference[] | null;
  salesOrder?: SourceReference["salesOrder"] | null;
  invoice?: (SourceReference["invoice"] & { orderNumberSnapshot?: string }) | null;
};

export function encodeReferenceSnapshot(values: string[]) {
  return JSON.stringify(Array.from(new Set(values.filter(Boolean))));
}

export function parseReferenceSnapshot(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
      : [];
  } catch {
    return value.trim() ? [value.trim()] : [];
  }
}

export function getDeliveryOrderReferences(note: DeliveryReferenceInput): Reference[] {
  if (note.sources?.length) {
    return note.sources.map(source => ({
      label: orderReference(source.salesOrder),
      href: getSalesOrderHref(source.salesOrder),
    }));
  }
  if (note.salesOrder) {
    return [{ label: orderReference(note.salesOrder), href: getSalesOrderHref(note.salesOrder) }];
  }
  const snapshots = parseReferenceSnapshot(note.orderReferencesSnapshot);
  if (snapshots.length) return snapshots.map(label => ({ label, href: null }));
  if (note.invoice?.orderNumberSnapshot) {
    return [{ label: note.invoice.orderNumberSnapshot, href: null }];
  }
  return [];
}

export function getDeliveryInvoiceReferences(note: DeliveryReferenceInput): Reference[] {
  if (note.sources?.length) {
    return note.sources.map(source => ({
      label: source.invoice.invoiceNumber,
      href: `/invoices?view=${encodeURIComponent(source.invoice.id)}`,
    }));
  }
  if (note.invoice) {
    return [{
      label: note.invoice.invoiceNumber,
      href: `/invoices?view=${encodeURIComponent(note.invoice.id)}`,
    }];
  }
  return parseReferenceSnapshot(note.invoiceReferencesSnapshot)
    .map(label => ({ label, href: null }));
}

function getSalesOrderHref(order: SourceReference["salesOrder"]) {
  const base = order.source === "CUSTOMER_PO"
    ? "/customer-purchase-orders"
    : "/sales-orders";
  return `${base}/${encodeURIComponent(order.id)}`;
}
