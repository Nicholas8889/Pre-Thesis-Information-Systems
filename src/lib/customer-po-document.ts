import { createHash } from "node:crypto";

export const CUSTOMER_PO_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

export const CUSTOMER_PO_DOCUMENT_TYPES: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"]
};

export type ValidatedCustomerPoDocument = {
  bytes: Uint8Array;
  originalName: string;
  mimeType: "application/pdf";
  size: number;
  sha256: string;
};

export async function validateCustomerPoDocument(
  entry: FormDataEntryValue | null
): Promise<ValidatedCustomerPoDocument | null> {
  if (!(entry instanceof File) || entry.size < 5 || entry.size > CUSTOMER_PO_DOCUMENT_MAX_BYTES) {
    return null;
  }
  if (entry.type !== "application/pdf" || !entry.name.toLowerCase().endsWith(".pdf")) {
    return null;
  }

  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (
    bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 || bytes[4] !== 0x2d
  ) {
    return null;
  }

  return {
    bytes,
    originalName: sanitizeCustomerPoDisplayName(entry.name),
    mimeType: "application/pdf",
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

export function sanitizeCustomerPoDisplayName(value: string) {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\x00-\x1F\x7F"\\/]/g, "_")
    .trim()
    .slice(0, 255);
  return sanitized || "customer-po-document.pdf";
}
