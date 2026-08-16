export function parseOptionalInquiryPrice(value: unknown) {
  const rawValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

export function canConvertCustomerInquiryItems(
  items: Array<{ productId: string | null; agreedUnitPrice: number | null }>
) {
  return items.length > 0 && items.every((item) => item.productId && item.agreedUnitPrice !== null);
}

export function formatCustomerInquiryStatus(status: string) {
  const labels: Record<string, string> = {
    Open: "Open",
    Closed: "Closed",
    Cancelled: "Cancelled",
    ConvertedToCustomerPO: "Converted to Customer PO",
    ConvertedToSO: "Converted to SO",
    Done: "Done"
  };

  return labels[status] ?? status;
}
