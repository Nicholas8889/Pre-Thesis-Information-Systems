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
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedPrice: 30000 }])).toBe(true);
    expect(canConvertCustomerInquiryItems([{ productId: null, agreedPrice: 30000 }])).toBe(false);
    expect(canConvertCustomerInquiryItems([{ productId: "product-1", agreedPrice: null }])).toBe(false);
  });

  it("keeps PO and SO abbreviations intact in status labels", () => {
    expect(formatCustomerInquiryStatus("ConvertedToPO")).toBe("Converted to PO");
    expect(formatCustomerInquiryStatus("ConvertedToSO")).toBe("Converted to SO");
  });
});
