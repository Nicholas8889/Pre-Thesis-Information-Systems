import { describe, expect, it } from "vitest";
import {
  canConvertCustomerInquiryItems,
  formatCustomerInquiryStatus,
  parseOptionalInquiryPrice,
  resolveAgreedUnitPrice
} from "../../src/lib/customer-inquiry";

describe("customer inquiry helpers", () => {
  it("keeps an empty agreed price empty", () => {
    expect(parseOptionalInquiryPrice("")).toBeNull();
    expect(parseOptionalInquiryPrice("  ")).toBeNull();
    expect(parseOptionalInquiryPrice("30000")).toBe(30000);
  });

  it.each(["0", "-1", "not-a-number", "1.5"])(
    "rejects an explicit invalid price %s instead of treating it as blank",
    value => {
      expect(() => parseOptionalInquiryPrice(value)).toThrow("positive whole numbers");
    }
  );

  it("resolves agreed, requested, then active Product list price in canonical order", () => {
    expect(resolveAgreedUnitPrice({ agreedUnitPrice: 35_000, requestedUnitPrice: 32_000, productListPrice: 30_000 })).toBe(35_000);
    expect(resolveAgreedUnitPrice({ agreedUnitPrice: null, requestedUnitPrice: 32_000, productListPrice: 30_000 })).toBe(32_000);
    expect(resolveAgreedUnitPrice({ agreedUnitPrice: null, requestedUnitPrice: null, productListPrice: 30_000 })).toBe(30_000);
    expect(resolveAgreedUnitPrice({ agreedUnitPrice: 0, requestedUnitPrice: 32_000, productListPrice: 30_000 })).toBeNull();
  });

  it("uses the same active-product fallback rule for conversion eligibility", () => {
    const activeProduct = { status: "Active", listPrice: 30_000 };
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: null, requestedUnitPrice: 32_000, product: activeProduct }])).toBe(true);
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: null, requestedUnitPrice: null, product: activeProduct }])).toBe(true);
    expect(canConvertCustomerInquiryItems([{ productId: null, agreedUnitPrice: 30_000, requestedUnitPrice: null, product: activeProduct }])).toBe(false);
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: 30_000, requestedUnitPrice: null, product: { ...activeProduct, status: "Inactive" } }])).toBe(false);
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: 0, requestedUnitPrice: 32_000, product: activeProduct }])).toBe(false);
  });

  it("uses explicit Customer PO and SO abbreviations in status labels", () => {
    expect(formatCustomerInquiryStatus("ConvertedToCustomerPO")).toBe("Converted to Customer PO");
    expect(formatCustomerInquiryStatus("ConvertedToSO")).toBe("Converted to SO");
  });
});
