import { describe, expect, it } from "vitest";
import {
  canConvertCustomerInquiryItems,
  formatCustomerInquiryStatus,
  parseOptionalInquiryPrice
} from "../../src/lib/customer-inquiry";

describe("customer inquiry helpers", () => {
  it("keeps an empty agreed price empty", () => {
    expect(parseOptionalInquiryPrice("")).toBeNull();
    expect(parseOptionalInquiryPrice("  ")).toBeNull();
    expect(parseOptionalInquiryPrice("30000")).toBe(30000);
  });

  it("only allows conversion when every item is mapped and agreed", () => {
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: 30000 }])).toBe(true);
    expect(canConvertCustomerInquiryItems([{ productId: null, agreedUnitPrice: 30000 }])).toBe(false);
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedUnitPrice: null }])).toBe(false);
  });

  it("uses explicit Customer PO and SO abbreviations in status labels", () => {
    expect(formatCustomerInquiryStatus("ConvertedToCustomerPO")).toBe("Converted to Customer PO");
    expect(formatCustomerInquiryStatus("ConvertedToSO")).toBe("Converted to SO");
  });
});
