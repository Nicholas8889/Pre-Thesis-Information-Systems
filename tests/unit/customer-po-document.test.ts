import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  sanitizeCustomerPoDisplayName,
  validateCustomerPoDocument
} from "../../src/lib/customer-po-document";

describe("Customer PO document policy", () => {
  it("accepts a PDF only after extension, MIME, size, and magic-byte validation", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\nfixture");
    const file = new File([bytes], "../customer\"po.pdf", { type: "application/pdf" });
    const result = await validateCustomerPoDocument(file);
    expect(result).toMatchObject({
      originalName: ".._customer_po.pdf",
      mimeType: "application/pdf",
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  });

  it("rejects empty, fake MIME, fake signature, and non-PDF files", async () => {
    await expect(validateCustomerPoDocument(new File([], "empty.pdf", { type: "application/pdf" }))).resolves.toBeNull();
    await expect(validateCustomerPoDocument(new File(["%PDF-"], "fake.pdf", { type: "text/plain" }))).resolves.toBeNull();
    await expect(validateCustomerPoDocument(new File(["not pdf"], "fake.pdf", { type: "application/pdf" }))).resolves.toBeNull();
    await expect(validateCustomerPoDocument(new File(["%PDF-"], "fake.png", { type: "application/pdf" }))).resolves.toBeNull();
  });

  it("sanitizes display names without using them as a storage key", () => {
    expect(sanitizeCustomerPoDisplayName("../../po\\name.pdf")).toBe(".._.._po_name.pdf");
  });
});
