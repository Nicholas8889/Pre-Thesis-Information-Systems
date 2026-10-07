import type { Prisma, Product, SalesOrderSource } from "@prisma/client";
import { createHash } from "node:crypto";
import { buildInvoiceSnapshot } from "../../src/lib/invoice-snapshot";
import { calculateTaxInclusiveAmounts } from "../../src/lib/tax";

export const editManager = { id: "edit-manager", role: "MANAGER" as const, username: "edit-manager", displayName: "Edit Manager" };
export const editSales = { id: "edit-sales", role: "SALES" as const, username: "edit-sales", displayName: "Edit Sales" };

export async function orderEditFixture(tx: Prisma.TransactionClient, marker: string, options: {
  source?: SalesOrderSource; invoiced?: boolean; pick?: boolean; approved?: boolean; pending?: boolean;
} = {}) {
  const source = options.source ?? "DIRECT";
  const invoiced = options.invoiced ?? true;
  const taxId = "9000" + (BigInt("0x" + createHash("sha256").update(marker).digest("hex").slice(0, 12)) % BigInt(1_000_000_000_000)).toString().padStart(12, "0");
  const customer = await tx.customer.create({ data: { name: "Original Contact", companyName: marker, npwp: taxId,
    phone: "old-phone", email: "old@example.test", address: "Original destination", customerSegment: "Retail" } });
  const products: Product[] = [];
  for (const [name, price] of [["A", 999], ["B", 50], ["C", 200], ["Zero", 0]] as const) {
    products.push(await tx.product.create({ data: { productName: `${marker}-${name}`, listPrice: price } }));
  }
  const tax = calculateTaxInclusiveAmounts({ totalAmount: 350, ppnApplied: true, ppnRateBasisPoints: 1100 });
  const order = await tx.salesOrder.create({ data: {
    orderNumber: `${marker}-SO`, source, customerId: customer.id, createdByUserId: editSales.id,
    orderDate: new Date("2026-10-01"), deliveryDestinationSnapshot: customer.address,
    ...(source === "CUSTOMER_PO" ? { customerPoNumber: `${marker}-PO`, requiredDate: new Date("2099-12-31"),
      customerPoDocumentName: "original.pdf", customerPoDocumentStoredName: `customer-purchase-orders/${marker}.pdf`,
      customerPoDocumentMimeType: "application/pdf" } : {}),
    status: options.pending ? "Draft" : invoiced ? "Invoiced" : "Confirmed",
    approvalStatus: options.pending ? "Pending" : options.approved ? "Approved" : "NotRequired",
    ...(options.approved ? { approvalDecisionNote: "Original approval", approvalDecidedAt: new Date("2026-10-01"), approvalDecidedById: "original-manager" } : {}),
    paymentTermType: "CREDIT", creditTermMonths: 1,
    subtotal: 350, total: 350, customerNpwpSnapshot: customer.npwp, ...tax,
    items: { create: [
      { productId: products[0].id, itemName: "Stored A", productSkuSnapshot: "STORED-A", quantity: 2,
        baseUnitPrice: 120, markupPercent: 25, discountPercent: 0, finalUnitPrice: 150, subtotal: 300 },
      { productId: products[1].id, itemName: "Stored B", quantity: 1, baseUnitPrice: 50, finalUnitPrice: 50, subtotal: 50 },
    ] },
  }, include: { items: { orderBy: { id: "asc" } } } });
  const invoice = invoiced ? await tx.invoice.create({ data: {
    invoiceNumber: `${marker}-INV`, salesOrderId: order.id, customerId: customer.id,
    issueDate: new Date("2026-10-01"), dueDate: new Date("2099-12-31"), paymentTermType: "CREDIT", creditTermMonths: 1,
    totalAmount: 350, remainingAmount: 350, customerNpwpSnapshot: customer.npwp, ...tax,
    ...buildInvoiceSnapshot({ orderNumber: order.orderNumber, source, customerPoNumber: order.customerPoNumber, customer, items: order.items }),
  } }) : null;
  const list = options.pick !== false && invoice ? await tx.pickingList.create({ data: {
    pickingListNumber: `${marker}-PL`, salesOrderId: order.id, usesChecklist: true, pickerName: "Original PIC", notes: "Original note",
    items: { create: order.items.map(item => ({ salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: item.quantity })) },
  }, include: { items: true } }) : null;
  const task = invoice ? await tx.collectionTask.create({ data: { customerId: customer.id, invoiceId: invoice.id,
    scheduledDate: invoice.dueDate, status: "Planned", notes: "Original collection note" } }) : null;
  const inquiry = await tx.customerInquiry.create({ data: { inquiryNumber: `${marker}-INQ`, customerId: customer.id,
    salesOrderId: order.id, status: source === "CUSTOMER_PO" ? "ConvertedToCustomerPO" : "ConvertedToSO",
    items: { create: [{ productId: products[0].id, itemName: "Original inquiry A", quantity: 2, agreedUnitPrice: 120 }] },
  }, include: { items: true } });
  return { customer, products, order, invoice, list, task, inquiry,
    a: order.items.find(item => item.productId === products[0].id)!, b: order.items.find(item => item.productId === products[1].id)! };
}
