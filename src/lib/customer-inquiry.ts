export function parseOptionalInquiryPrice(value: unknown) {
  const rawValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (!rawValue) return null;

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Inquiry prices must be positive whole numbers");
  }
  return parsed;
}

export function resolveAgreedUnitPrice({
  agreedUnitPrice,
  requestedUnitPrice,
  productListPrice
}: {
  agreedUnitPrice: number | null;
  requestedUnitPrice: number | null;
  productListPrice: number;
}) {
  const resolved = agreedUnitPrice ?? requestedUnitPrice ?? productListPrice;
  return Number.isSafeInteger(resolved) && resolved > 0 ? resolved : null;
}

export function canConvertCustomerInquiryItems(
  items: Array<{
    productId: string | null;
    agreedUnitPrice: number | null;
    requestedUnitPrice: number | null;
    product: { status: string; listPrice: number } | null;
  }>
) {
  return items.length > 0 && items.every((item) =>
    Boolean(
      item.productId &&
      item.product?.status === "Active" &&
      resolveAgreedUnitPrice({
        agreedUnitPrice: item.agreedUnitPrice,
        requestedUnitPrice: item.requestedUnitPrice,
        productListPrice: item.product.listPrice
      })
    )
  );
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
