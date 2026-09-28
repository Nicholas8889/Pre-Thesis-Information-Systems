import type { Prisma, SalesOrderSource } from "@prisma/client";

export type InvoiceItemSnapshot = {
  itemName: string;
  productSku: string | null;
  quantity: number;
  baseUnitPrice: number;
  markupPercent: number;
  discountPercent: number;
  finalUnitPrice: number;
  subtotal: number;
};

export function buildInvoiceSnapshot(input: {
  orderNumber: string;
  source: SalesOrderSource;
  customerPoNumber: string | null;
  customer: {
    name: string;
    companyName: string;
    phone: string;
    email: string;
    address: string;
  };
  items: Array<{
    itemName: string;
    productSkuSnapshot?: string | null;
    quantity: number;
    baseUnitPrice: number;
    markupPercent: number;
    discountPercent: number;
    finalUnitPrice: number;
    subtotal: number;
  }>;
}) {
  const items: InvoiceItemSnapshot[] = input.items.map(item => ({
    itemName: item.itemName,
    productSku: item.productSkuSnapshot ?? null,
    quantity: item.quantity,
    baseUnitPrice: item.baseUnitPrice,
    markupPercent: item.markupPercent,
    discountPercent: item.discountPercent,
    finalUnitPrice: item.finalUnitPrice,
    subtotal: item.subtotal
  }));
  return {
    orderNumberSnapshot: input.orderNumber,
    orderSourceSnapshot: input.source,
    customerPoNumberSnapshot: input.customerPoNumber,
    customerNameSnapshot: input.customer.name,
    customerCompanySnapshot: input.customer.companyName,
    customerPhoneSnapshot: input.customer.phone,
    customerEmailSnapshot: input.customer.email,
    customerAddressSnapshot: input.customer.address,
    itemsSnapshot: items as unknown as Prisma.InputJsonValue
  };
}

export function parseInvoiceItemSnapshots(value: Prisma.JsonValue): InvoiceItemSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const numbers = [
      row.quantity,
      row.baseUnitPrice,
      row.markupPercent,
      row.discountPercent,
      row.finalUnitPrice,
      row.subtotal
    ];
    if (typeof row.itemName !== "string" || numbers.some(number => !Number.isSafeInteger(number))) {
      return [];
    }
    return [{
      itemName: row.itemName,
      productSku: typeof row.productSku === "string" ? row.productSku : null,
      quantity: row.quantity as number,
      baseUnitPrice: row.baseUnitPrice as number,
      markupPercent: row.markupPercent as number,
      discountPercent: row.discountPercent as number,
      finalUnitPrice: row.finalUnitPrice as number,
      subtotal: row.subtotal as number
    }];
  });
}
