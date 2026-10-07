"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type {
  CustomerStatus,
  CustomerInquiryStatus,
  DeliveryNoteStatus,
  ProductStatus,
  SalesOrderApprovalStatus,
  SalesOrderSource
} from "@prisma/client";
import { isValidSalesOrderPaymentTerm } from "@/lib/calculations";
import { createAuditTrailLog } from "@/lib/audit";
import { getCustomerPaymentSummary } from "@/lib/customer-intelligence";
import { customerInvoiceBalanceSelect } from "@/lib/customer-payment-query";
import { prisma } from "@/lib/prisma";
import {
  canCreateDeliveryFromSheet,
  getPickingDeliveryQuantity,
  canFulfillOrder,
} from "@/lib/picking-list";
import { parseOptionalNpwp } from "@/lib/npwp";
import { canRole } from "@/lib/role-access";
import {
  requiresApprovalDecisionNote,
  requiresManagerApproval
} from "@/lib/sales-order-approval";
import { requireCurrentUser } from "@/lib/session";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import { buildOrderTaxSnapshot } from "@/lib/tax";
import {
  canDeleteOngoingSalesOrder
} from "@/lib/sales-order-deletion";
import {
  ActionNoteValidationError,
  mergeActionNotes,
  normalizeActionNote
} from "@/lib/action-notes";
import {
  parseOptionalInquiryPrice,
  resolveAgreedUnitPrice
} from "@/lib/customer-inquiry";
import {
  canTransitionCollectionTask,
  parseCollectionTaskTransition,
  parseCollectionTaskVersion
} from "@/lib/collection-task";
import { getJakartaDocumentYear } from "@/lib/document-numbering";
import { buildInvoiceSnapshot } from "@/lib/invoice-snapshot";
import { canCancelInvoice, canGenerateInvoiceForOrder } from "@/lib/invoice-policy";
import { completeCustomerInquiriesForDeliveredOrders } from "@/lib/customer-inquiry-lifecycle";
import {
  claimCustomerInquiryConversion,
  InquiryConversionConflictError
} from "@/lib/customer-inquiry-conversion";
import { parseJakartaDateTimeInput } from "@/lib/delivery-note-status";
import { parseDateOnly } from "@/lib/date-only";
import {
  haveSameDeliveryDestination,
  normalizeDeliveryDestination
} from "@/lib/delivery-destination";
import { validateDeliveryAssignment } from "@/lib/delivery-options";
import { orderReference } from "@/lib/delivery-note-links";
import { encodeReferenceSnapshot } from "@/lib/delivery-note-references";
import { parsePaymentMethod } from "@/lib/payment-method";
import {
  PaymentRecordingError,
  recordInvoicePayment
} from "@/lib/payment-recording";
import {
  deleteCustomerPoDocument,
  uploadCustomerPoDocument,
  validateCustomerPoDocument
} from "@/lib/customer-po-storage";
import {
  calculateOrderTotals,
  allocateDocumentNumber,
  getDueDateForPaymentTerm,
  normalizeOrderItems,
  MAX_ORDER_UNIT_PRICE,
  parseSalesOrderPaymentTerm
} from "@/lib/workflow";

const pathsToRefresh = [
  "/",
  "/customers",
  "/products",
  "/customer-inquiries",
  "/customer-purchase-orders",
  "/sales-orders",
  "/invoices",
  "/payments",
  "/pick-pack",
  "/surat-jalan",
  "/receivables",
  "/collections",
  "/customer-outreach",
  "/audit-trail"
];

class SalesOrderApprovalConflictError extends Error {
  constructor() {
    super("Sales order approval is no longer pending");
    this.name = "SalesOrderApprovalConflictError";
  }
}

class InvoiceGenerationConflictError extends Error {
  constructor() {
    super("Invoice generation is no longer eligible");
    this.name = "InvoiceGenerationConflictError";
  }
}

class InvoiceCancellationConflictError extends Error {
  constructor() {
    super("Invoice cancellation is no longer eligible");
    this.name = "InvoiceCancellationConflictError";
  }
}

class CollectionTaskConflictError extends Error {
  constructor() {
    super("Collection task changed before this request was committed");
    this.name = "CollectionTaskConflictError";
  }
}

export async function createCustomer(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const name = getRequiredString(formData, "name");
  const companyName = getRequiredString(formData, "companyName");
  const npwpResult = parseOptionalNpwp(formData.get("npwp"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!name || !companyName) {
    redirectWithMessage("/customers", "error", "Contact person and company name are required");
  }

  if (!npwpResult.valid) {
    redirectWithMessage("/customers?mode=add", "error", npwpResult.error);
  }

  const status = getStatus<CustomerStatus>(formData, "status", ["Active", "Inactive"], "Active");
  try {
    await prisma.$transaction(async tx => {
      const created = await tx.customer.create({
        data: {
          name,
          companyName,
          npwp: npwpResult.value,
          phone: getString(formData, "phone"),
          email: getString(formData, "email"),
          address: getString(formData, "address"),
          customerSegment: getString(formData, "customerSegment") || "Retail",
          status,
          portfolioOwnerUserId: currentUser.role === "SALES" ? currentUser.id : null,
          notes: mergeActionNotes(getString(formData, "notes"), actionNote)
        }
      });
      await createAuditTrailLog({
        actor: currentUser,
        moduleName: "Customers",
        entityType: "CUSTOMER",
        entityId: created.id,
        recordReference: created.companyName || created.name,
        action: "CREATED",
        actionNote,
        changeSummary: `Customer ${created.companyName || created.name} created`,
        newValue: summarizeCustomer(created)
      }, { transaction: tx });
      return created;
    });
  } catch (error) {
    if (isUniqueFieldCollision(error, "npwp")) {
      redirectWithMessage(
        "/customers?mode=add",
        "error",
        "NPWP is already used by another customer"
      );
    }
    throw error;
  }

  refreshApp();
  redirectWithMessage("/customers", "success", "Customer added");
}

export async function updateCustomer(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const id = getRequiredString(formData, "id");
  const name = getRequiredString(formData, "name");
  const companyName = getRequiredString(formData, "companyName");
  const npwpResult = parseOptionalNpwp(formData.get("npwp"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !name || !companyName) {
    redirectWithMessage(
      "/customers",
      "error",
      "Customer ID, name, and company name are required"
    );
  }

  if (!npwpResult.valid) {
    redirectWithMessage(`/customers?edit=${id}`, "error", npwpResult.error);
  }

  const oldCustomer = await prisma.customer.findFirst({
    where: { id, ...portfolio.customerWhere }
  });

  if (!oldCustomer) {
    redirectWithMessage("/customers", "error", "Customer was not found");
  }

  const status = getStatus<CustomerStatus>(formData, "status", ["Active", "Inactive"], "Active");
  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.customer.update({
        where: { id },
        data: {
          name,
          companyName,
          npwp: npwpResult.value,
          phone: getString(formData, "phone"),
          email: getString(formData, "email"),
          address: getString(formData, "address"),
          customerSegment: getString(formData, "customerSegment") || "Retail",
          status,
          notes: mergeActionNotes(getString(formData, "notes"), actionNote)
        }
      });
      await createAuditTrailLog({
        actor: currentUser,
        moduleName: "Customers",
        entityType: "CUSTOMER",
        entityId: updated.id,
        recordReference: updated.companyName || updated.name,
        action: oldCustomer.status !== updated.status ? "STATUS_CHANGED" : "UPDATED",
        actionNote,
        changeSummary:
          oldCustomer.status !== updated.status
            ? `Customer status changed from ${oldCustomer.status} to ${updated.status}`
            : `Customer ${updated.companyName || updated.name} updated`,
        oldValue: summarizeCustomer(oldCustomer),
        newValue: summarizeCustomer(updated)
      }, { transaction: tx });
      return updated;
    });
  } catch (error) {
    if (isUniqueFieldCollision(error, "npwp")) {
      redirectWithMessage(
        `/customers?edit=${id}`,
        "error",
        "NPWP is already used by another customer"
      );
    }
    throw error;
  }

  refreshApp();
  redirect(`/customers?view=${id}&success=${encodeURIComponent("Customer updated")}`);
}

export async function updateCustomerStatus(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const id = getRequiredString(formData, "id");
  const requestedStatus = getString(formData, "status");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !["Active", "Inactive"].includes(requestedStatus)) {
    redirectWithMessage("/customers", "error", "Customer and a valid status are required");
  }

  const oldCustomer = await prisma.customer.findFirst({
    where: { id, ...portfolio.customerWhere }
  });

  if (!oldCustomer) {
    redirectWithMessage("/customers", "error", "Customer was not found");
  }

  const status = requestedStatus as CustomerStatus;
  const customer = await prisma.$transaction(async tx => {
    const updated = await tx.customer.update({
      where: { id },
      data: { status, notes: mergeActionNotes(oldCustomer.notes, actionNote) }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Customers",
      entityType: "CUSTOMER",
      entityId: updated.id,
      recordReference: updated.companyName || updated.name,
      action: "STATUS_CHANGED",
      actionNote,
      changeSummary: `Customer status changed from ${oldCustomer.status} to ${updated.status}`,
      oldValue: { status: oldCustomer.status },
      newValue: { status: updated.status }
    }, { transaction: tx });
    return updated;
  });

  refreshApp();
  redirect(
    `/customers?view=${id}&success=${encodeURIComponent(
      `Customer marked as ${customer.status.toLowerCase()}`
    )}`
  );
}

export async function createProduct(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (currentUser.role !== "ADMIN") {
    redirectWithMessage("/products", "error", "Only Admin can enter production costs and add products");
  }
  const productName = getRequiredString(formData, "productName");
  const sku = parseProductSku(formData.get("sku"));
  const listPrice = parseProductPrice(formData.get("listPrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!productName) {
    redirectWithMessage("/products", "error", "Product name is required");
  }

  if (listPrice === null) {
    redirectWithMessage("/products", "error", "Production Cost / Unit must be a valid non-negative amount");
  }

  const status = getStatus<ProductStatus>(formData, "status", ["Active", "Inactive"], "Active");
  await prisma.$transaction(async tx => {
    const product = await tx.product.create({
      data: {
        productName,
        sku,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote),
        listPrice,
        status,
        costHistory: {
          create: { unitCost: listPrice, createdByUserId: currentUser.id }
        }
      }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Products",
      entityType: "PRODUCT",
      entityId: product.id,
      recordReference: product.productName,
      action: "CREATED",
      actionNote,
      changeSummary: `Product ${product.productName} created`,
      newValue: summarizeProduct(product)
    }, { transaction: tx });
  });

  refreshApp();
  redirectWithMessage("/products", "success", "Product added");
}

export async function updateProduct(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const productName = getRequiredString(formData, "productName");
  const sku = parseProductSku(formData.get("sku"));
  const listPrice = parseProductPrice(formData.get("listPrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !productName) {
    redirectWithMessage("/products", "error", "Product ID and product name are required");
  }

  if (listPrice === null) {
    redirectWithMessage("/products", "error", "Production Cost / Unit must be a valid non-negative amount");
  }

  const status = getStatus<ProductStatus>(formData, "status", ["Active", "Inactive"], "Active");
  await prisma.$transaction(async tx => {
    // Serialize cost changes so each history entry matches the committed master.
    await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id" = ${id} FOR UPDATE`;
    const oldProduct = await tx.product.findUnique({ where: { id } });
    if (!oldProduct) {
      redirectWithMessage("/products", "error", "Product was not found");
    }
    const costChanged = oldProduct.listPrice !== listPrice;
    if (costChanged && currentUser.role !== "ADMIN") {
      redirectWithMessage("/products", "error", "Only Admin can change Production Cost / Unit");
    }
    const product = await tx.product.update({
      where: { id },
      data: {
        productName,
        sku,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote),
        listPrice,
        status,
        ...(costChanged ? {
          costHistory: {
            create: {
              unitCost: listPrice,
              createdByUserId: currentUser.id,
              effectiveFrom: new Date()
            }
          }
        } : {})
      }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Products",
      entityType: "PRODUCT",
      entityId: product.id,
      recordReference: product.productName,
      action: oldProduct.status !== product.status ? "STATUS_CHANGED" : "UPDATED",
      actionNote,
      changeSummary:
        oldProduct.status !== product.status
          ? `Product status changed from ${oldProduct.status} to ${product.status}`
          : `Product ${product.productName} updated`,
      oldValue: summarizeProduct(oldProduct),
      newValue: summarizeProduct(product)
    }, { transaction: tx });
  });

  refreshApp();
  redirect(`/products?view=${id}&success=${encodeURIComponent("Product updated")}`);
}

export async function updateProductStatus(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const requestedStatus = getString(formData, "status");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !["Active", "Inactive"].includes(requestedStatus)) {
    redirectWithMessage("/products", "error", "Product and a valid status are required");
  }

  const oldProduct = await prisma.product.findUnique({ where: { id } });

  if (!oldProduct) {
    redirectWithMessage("/products", "error", "Product was not found");
  }

  const status = requestedStatus as ProductStatus;
  const product = await prisma.$transaction(async tx => {
    const updated = await tx.product.update({
      where: { id },
      data: { status, notes: mergeActionNotes(oldProduct.notes, actionNote) }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Products",
      entityType: "PRODUCT",
      entityId: updated.id,
      recordReference: updated.productName,
      action: "STATUS_CHANGED",
      actionNote,
      changeSummary: `Product status changed from ${oldProduct.status} to ${updated.status}`,
      oldValue: { status: oldProduct.status },
      newValue: { status: updated.status }
    }, { transaction: tx });
    return updated;
  });

  refreshApp();
  redirect(
    `/products?view=${id}&success=${encodeURIComponent(
      `Product marked as ${product.status.toLowerCase()}`
    )}`
  );
}

export async function createCustomerInquiry(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const customerId = getRequiredString(formData, "customerId");
  const notes = getString(formData, "notes");
  const neededBy = parseDateInput(getString(formData, "neededBy"));
  const rawItems = safeJsonParse(getString(formData, "items"));
  let items: Array<{
    productId: string | null;
    itemName: string;
    quantity: number;
    requestedUnitPrice: number | null;
    agreedUnitPrice: number | null;
    notes: string | null;
  }>;
  try {
    items = Array.isArray(rawItems)
      ? rawItems.map((item) => ({
          productId: typeof item?.productId === "string" && item.productId ? item.productId : null,
          itemName: typeof item?.itemName === "string" ? item.itemName.trim() : "",
          quantity: Number(item?.quantity),
          requestedUnitPrice: parseOptionalInquiryPrice(item?.requestedUnitPrice),
          agreedUnitPrice: parseOptionalInquiryPrice(item?.agreedUnitPrice),
          notes: typeof item?.notes === "string" && item.notes.trim() ? item.notes.trim() : null
        }))
      : [];
  } catch {
    redirectWithMessage(
      "/customer-inquiries",
      "error",
      "Requested and agreed prices must be blank or positive whole numbers"
    );
  }

  if (!customerId || !items.length || items.some((item) => !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    redirectWithMessage("/customer-inquiries", "error", "Select a customer and add at least one valid item");
  }
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...portfolio.customerWhere }
  });
  if (!customer) redirectWithMessage("/customer-inquiries", "error", "Customer was not found");
  const productIds = [...new Set(items.map(item => item.productId!))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "Active" },
    select: { id: true, productName: true, sku: true }
  });
  if (products.length !== productIds.length) {
    redirectWithMessage("/customer-inquiries", "error", "Every inquiry item must use an active Product");
  }
  const productById = new Map(products.map(product => [product.id, product]));
  const canonicalItems = items.map(item => {
    const product = productById.get(item.productId!);
    if (!product) throw new Error("INACTIVE_INQUIRY_PRODUCT");
    return {
      ...item,
      productId: product.id,
      itemName: product.productName,
      productSkuSnapshot: product.sku
    };
  });
  const inquiryNumber = await allocateDocumentNumber("INQ", getJakartaDocumentYear());
  const inquiry = await prisma.$transaction(async tx => {
    const created = await tx.customerInquiry.create({
      data: {
        inquiryNumber,
        customerId,
        neededBy,
        notes: notes || null,
        items: { create: canonicalItems }
      }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Customer Inquiry",
      entityType: "CUSTOMER_INQUIRY",
      entityId: created.id,
      recordReference: created.inquiryNumber,
      action: "CREATED",
      changeSummary: `Customer inquiry ${created.inquiryNumber} created for ${customer.companyName}`,
      newValue: { status: created.status, itemCount: canonicalItems.length }
    }, { transaction: tx });
    return created;
  });
  refreshApp();
  redirectWithMessage(`/customer-inquiries/${inquiry.id}`, "success", "Customer inquiry created");
}

export async function updateCustomerInquiryStatus(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const inquiryId = getRequiredString(formData, "inquiryId");
  const status = getStatus<CustomerInquiryStatus>(formData, "status", ["Closed", "Cancelled"], "Closed");
  const statusNote = getRequiredString(formData, "statusNote");
  if (!inquiryId || !statusNote) redirectWithMessage("/customer-inquiries", "error", "A status reason is required");
  const inquiry = await prisma.customerInquiry.findFirst({
    where: { id: inquiryId, ...portfolio.inquiryWhere }
  });
  if (!inquiry || inquiry.status !== "Open") redirectWithMessage("/customer-inquiries", "error", "Only open inquiries can be updated");
  await prisma.$transaction(async tx => {
    await tx.customerInquiry.update({ where: { id: inquiryId }, data: { status, statusNote } });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Customer Inquiry",
      entityType: "CUSTOMER_INQUIRY",
      entityId: inquiryId,
      recordReference: inquiry.inquiryNumber,
      action: status === "Cancelled" ? "CANCELLED" : "CLOSED",
      changeSummary: `Customer inquiry ${inquiry.inquiryNumber} marked ${status.toLowerCase()} by ${currentUser.displayName}`,
      newValue: { status, statusNote }
    }, { transaction: tx });
  });
  refreshApp();
  redirectWithMessage(`/customer-inquiries/${inquiryId}`, "success", `Inquiry marked ${status.toLowerCase()}`);
}

export async function createSalesOrder(formData: FormData) {
  const rawSource = getString(formData, "source") || "DIRECT";
  if (rawSource !== "DIRECT" && rawSource !== "CUSTOMER_PO") {
    redirectWithMessage("/sales-orders", "error", "Invalid Sales Order source");
  }
  const source = rawSource as SalesOrderSource;
  const isCustomerPo = source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const moduleName = isCustomerPo ? "Customer Purchase Orders" : "Sales Orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";
  const customerPoNumberEntry = isCustomerPo ? formData.get("customerPoNumber") : null;
  if (customerPoNumberEntry !== null && typeof customerPoNumberEntry !== "string") {
    redirectWithMessage(`${basePath}?mode=create`, "error", "Customer PO Number must be entered as text");
  }
  const requestedCustomerPoNumber = typeof customerPoNumberEntry === "string" ? customerPoNumberEntry.trim() : "";
  if (requestedCustomerPoNumber.length > 120 || /[\u0000-\u001f\u007f]/.test(requestedCustomerPoNumber)) {
    redirectWithMessage(`${basePath}?mode=create`, "error", "Customer PO Number must be a single line of 120 characters or fewer");
  }
  const customerId = getRequiredString(formData, "customerId");
  const inquiryId = getString(formData, "inquiryId");
  const idempotencyKey = getString(formData, "idempotencyKey") || randomUUID();
  const rawItems = getString(formData, "items");
  const notes = getString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const submittedItems = normalizeOrderItems(safeJsonParse(rawItems));
  const rawPaymentTermType = getString(formData, "paymentTermType");
  const paymentTerm = parseSalesOrderPaymentTerm({
    paymentTermType: formData.get("paymentTermType"),
    creditTerm: formData.get("creditTerm"),
    creditTermMonths: formData.get("creditTermMonths"),
    creditTermWeeks: formData.get("creditTermWeeks")
  });
  const paymentTermType = paymentTerm?.paymentTermType ?? "IMMEDIATE";
  const creditTermMonths = paymentTerm?.creditTermMonths ?? null;
  const creditTermWeeks = paymentTerm?.creditTermWeeks ?? null;

  if (!customerId || submittedItems.length === 0 || idempotencyKey.length > 200) {
    redirectWithMessage(
      basePath,
      "error",
      "Select a customer and add only valid order items"
    );
  }

  if (
    !paymentTerm || !isValidSalesOrderPaymentTerm({
      paymentTermType: rawPaymentTermType,
      creditTermMonths,
      creditTermWeeks
    })
  ) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Select Immediate Payment or choose a Credit term from 1 to 4 weeks or 1 to 12 months"
    );
  }

  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  if (!canRole(currentUser?.role, "CREATE_SALES_ORDER")) {
    redirectWithMessage(
      basePath,
      "error",
      "Only Sales and Manager roles can create Sales Orders"
    );
  }
  const existingIdempotentOrder = await prisma.salesOrder.findUnique({
    where: { idempotencyKey },
    select: { id: true, source: true, createdByUserId: true }
  });
  if (existingIdempotentOrder) {
    if (
      existingIdempotentOrder.source === source &&
      existingIdempotentOrder.createdByUserId === currentUser.id
    ) {
      redirectWithMessage(`${basePath}?view=${existingIdempotentOrder.id}`, "success", `${orderLabel} already created`);
    }
    redirectWithMessage(basePath, "error", "Duplicate order submission was rejected");
  }
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...portfolio.customerWhere },
    include: {
      invoices: {
        where: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } },
        select: customerInvoiceBalanceSelect
      }
    }
  });

  if (!customer) {
    redirectWithMessage(`${basePath}?mode=create`, "error", "Customer was not found");
  }
  const inquiry = inquiryId
    ? await prisma.customerInquiry.findFirst({
      where: { id: inquiryId, ...portfolio.inquiryWhere },
      include: {
        items: {
          include: {
            product: { select: { status: true, listPrice: true } }
          }
        }
      }
    })
    : null;
  if (inquiryId) {
    if (!inquiry || inquiry.customerId !== customerId || inquiry.status !== "Open") {
      redirectWithMessage(basePath, "error", "Customer Inquiry is not available for conversion");
    }
    const sourceItems = inquiry.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      baseUnitPrice: item.product
        ? resolveAgreedUnitPrice({
            agreedUnitPrice: item.agreedUnitPrice,
            requestedUnitPrice: item.requestedUnitPrice,
            productListPrice: item.product.listPrice
          })
        : null,
      active: item.product?.status === "Active"
    }));
    const submittedSignature = submittedItems
      .map(item => `${item.productId}:${item.quantity}:${item.baseUnitPrice}`)
      .sort();
    const sourceSignature = sourceItems
      .map(item => `${item.productId ?? ""}:${item.quantity}:${item.baseUnitPrice ?? ""}`)
      .sort();
    if (
      sourceItems.some(item => !item.productId || !item.active || item.baseUnitPrice === null) ||
      sourceSignature.length !== submittedSignature.length ||
      sourceSignature.some((value, index) => value !== submittedSignature[index])
    ) {
      redirectWithMessage(basePath, "error", "Inquiry products are unavailable or the conversion payload no longer matches the source");
    }
  }

  const productIds = [...new Set(submittedItems.map((item) => item.productId))];
  const activeProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "Active" },
    select: { id: true, productName: true, sku: true, listPrice: true }
  });

  if (activeProducts.length !== productIds.length) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Every item must use an active Product from the Product menu"
    );
  }

  const productSnapshots = new Map(
    activeProducts.map((product) => [product.id, product])
  );
  const items = submittedItems.map((item) => ({
    ...item,
    itemName: productSnapshots.get(item.productId)?.productName ?? item.itemName,
    productSkuSnapshot: productSnapshots.get(item.productId)?.sku ?? null
  }));
  const totals = calculateOrderTotals(items);
  const taxSnapshot = buildOrderTaxSnapshot({
    totalAmount: totals.total,
    customerNpwp: customer.npwp
  });
  const requiredDate = isCustomerPo
    ? parseDateInput(getString(formData, "requiredDate"))
    : null;
  const customerPoDocument = isCustomerPo
    ? await validateCustomerPoDocument(formData.get("customerPoDocument"))
    : null;

  if (isCustomerPo && !requiredDate) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "A valid product required date is required"
    );
  }

  if (isCustomerPo && !customerPoDocument) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Upload a non-empty PDF document with a valid PDF signature (maximum 8 MB)"
    );
  }
  if (requestedCustomerPoNumber && await prisma.salesOrder.findUnique({
    where: { customerPoNumber: requestedCustomerPoNumber },
    select: { id: true }
  })) {
    redirectWithMessage(`${basePath}?mode=create`, "error", "Customer PO Number is already used. Enter a different number or leave it blank to generate automatically");
  }
  const storedDocument = customerPoDocument
    ? await uploadCustomerPoDocument(customerPoDocument)
    : null;
  const buildOrderSourceData = (customerPoNumber: string | null) => ({
    source,
    customerPoNumber,
    requiredDate,
    customerPoDocumentName: storedDocument?.originalName ?? null,
    customerPoDocumentStoredName: storedDocument?.storedName ?? null,
    customerPoDocumentMimeType: storedDocument?.mimeType ?? null,
    customerPoDocumentSize: storedDocument?.size ?? null,
    customerPoDocumentSha256: storedDocument?.sha256 ?? null
  });
  const paymentSummary = getCustomerPaymentSummary(customer);
  const needsApproval = requiresManagerApproval(currentUser?.role ?? "", paymentSummary.paymentStatus);
  const issueDate = new Date();
  const createsInvoice = !needsApproval && currentUser.role !== "SALES";
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths,
    creditTermWeeks
  });

  const [orderNumber, customerPoNumber, invoiceNumber] = await Promise.all([
    allocateDocumentNumber("SO", getJakartaDocumentYear(issueDate)),
    isCustomerPo
      ? requestedCustomerPoNumber || allocateAvailableCustomerPoNumber(getJakartaDocumentYear(issueDate))
      : Promise.resolve(null),
    createsInvoice ? allocateDocumentNumber("INV", getJakartaDocumentYear(issueDate)) : Promise.resolve(null)
  ]);
  let result: {
    salesOrder: Awaited<ReturnType<typeof prisma.salesOrder.create>>;
    invoice: Awaited<ReturnType<typeof prisma.invoice.create>> | null;
    collectionTask: Awaited<ReturnType<typeof prisma.collectionTask.create>> | null;
  };
  try {
    result = await prisma.$transaction(async (tx) => {
        const currentProducts = await tx.product.findMany({
          where: { id: { in: productIds }, status: "Active" },
          select: { id: true, listPrice: true }
        });
        if (currentProducts.length !== productIds.length) {
          throw new Error("ORDER_PRODUCT_UNAVAILABLE");
        }
        if (inquiry) {
          const currentProductById = new Map(
            currentProducts.map(product => [product.id, product])
          );
          const currentSourceSignature = inquiry.items
            .map(item => {
              const currentProduct = item.productId
                ? currentProductById.get(item.productId)
                : undefined;
              const price = currentProduct
                ? resolveAgreedUnitPrice({
                    agreedUnitPrice: item.agreedUnitPrice,
                    requestedUnitPrice: item.requestedUnitPrice,
                    productListPrice: currentProduct.listPrice
                  })
                : null;
              return `${item.productId ?? ""}:${item.quantity}:${price ?? ""}`;
            })
            .sort();
          const submittedSignature = submittedItems
            .map(item => `${item.productId}:${item.quantity}:${item.baseUnitPrice}`)
            .sort();
          if (
            currentSourceSignature.length !== submittedSignature.length ||
            currentSourceSignature.some((value, index) => value !== submittedSignature[index])
          ) {
            throw new Error("INQUIRY_PRICE_CONFLICT");
          }
        }
        const salesOrder = await tx.salesOrder.create({
          data: {
            orderNumber,
            ...buildOrderSourceData(customerPoNumber),
            idempotencyKey,
            customerId,
            deliveryDestinationSnapshot: customer.address,
            orderDate: issueDate,
            status: needsApproval ? "Draft" : createsInvoice ? "Invoiced" : "Confirmed",
            subtotal: totals.subtotal,
            total: totals.total,
            ...taxSnapshot,
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            notes: mergeActionNotes(notes, actionNote),
            approvalStatus: needsApproval ? "Pending" : "NotRequired",
            approvalRisk: needsApproval ? paymentSummary.paymentStatus : null,
            createdByUserId: currentUser.id,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                itemName: item.itemName,
                productSkuSnapshot: item.productSkuSnapshot,
                quantity: item.quantity,
                baseUnitPrice: item.baseUnitPrice,
                markupPercent: item.markupPercent,
                discountPercent: item.discountPercent,
                finalUnitPrice: item.finalUnitPrice,
                subtotal: item.quantity * item.finalUnitPrice
              }))
            }
          }
        });
        if (inquiry) {
          await claimCustomerInquiryConversion(tx, {
            inquiryId: inquiry.id,
            salesOrderId: salesOrder.id,
            expectedUpdatedAt: inquiry.updatedAt,
            targetStatus: isCustomerPo ? "ConvertedToCustomerPO" : "ConvertedToSO"
          });
        }
        const createdInvoice = createsInvoice ? await tx.invoice.create({
          data: {
            invoiceNumber: invoiceNumber!,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            issueDate,
            dueDate,
            totalAmount: salesOrder.total,
            paidAmount: 0,
            remainingAmount: salesOrder.total,
            customerNpwpSnapshot: salesOrder.customerNpwpSnapshot,
            ppnApplied: salesOrder.ppnApplied,
            ppnRateBasisPoints: salesOrder.ppnRateBasisPoints,
            ppnAmount: salesOrder.ppnAmount,
            netSalesAmount: salesOrder.netSalesAmount,
            ...buildInvoiceSnapshot({
              orderNumber: salesOrder.orderNumber,
              source: salesOrder.source,
              customerPoNumber: salesOrder.customerPoNumber,
              customer,
              items: items.map(item => ({
                ...item,
                subtotal: item.quantity * item.finalUnitPrice
              }))
            }),
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            status: "Unpaid",
            notes: actionNote || null
          }
        }) : null;

        const collectionTask =
          createdInvoice && paymentTermType === "CREDIT"
            ? await tx.collectionTask.create({
                data: {
                  customerId,
                  invoiceId: createdInvoice.id,
                  scheduledDate: dueDate,
                  status: "Planned",
                  notes: `Credit payment collection reminder for ${invoiceNumber}`
                }
              })
            : null;
        const orderAction = needsApproval ? "APPROVAL_REQUESTED" : "CREATED";
        const auditEntries = [{
          actor: currentUser,
          moduleName,
          entityType: "SALES_ORDER",
          entityId: salesOrder.id,
          recordReference: salesOrder.orderNumber,
          action: orderAction,
          actionNote,
          changeSummary: needsApproval
            ? `${orderLabel} ${salesOrder.orderNumber} requires Manager approval because the customer has outstanding payments`
            : createdInvoice
              ? `${orderLabel} ${salesOrder.orderNumber} created and invoiced`
              : `${orderLabel} ${salesOrder.orderNumber} created and is ready for Admin or Manager invoicing`,
          newValue: {
            orderNumber: salesOrder.orderNumber,
            customerPoNumber: salesOrder.customerPoNumber,
            status: salesOrder.status,
            approvalStatus: salesOrder.approvalStatus,
            total: salesOrder.total,
            taxSnapshot: summarizeTaxSnapshot(salesOrder),
            paymentTermType: salesOrder.paymentTermType,
            creditTermMonths: salesOrder.creditTermMonths,
            creditTermWeeks: salesOrder.creditTermWeeks,
            items: summarizeOrderPricing(items)
          }
        }, ...(createdInvoice ? [{
          actor: currentUser,
          moduleName: "Invoices",
          entityType: "INVOICE",
          entityId: createdInvoice.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Invoice ${createdInvoice.invoiceNumber} generated from sales order ${salesOrder.orderNumber}`,
          newValue: summarizeInvoice(createdInvoice)
        }, {
          actor: currentUser,
          moduleName: "Receivables",
          entityType: "RECEIVABLE",
          entityId: createdInvoice.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Receivable created from invoice ${createdInvoice.invoiceNumber}`,
          newValue: summarizeInvoice(createdInvoice)
        }] : []), ...(collectionTask && createdInvoice ? [{
          actor: currentUser,
          moduleName: "Collections",
          entityType: "COLLECTION_TASK",
          entityId: collectionTask.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Credit payment collection task created for invoice ${createdInvoice.invoiceNumber}`,
          newValue: summarizeCollectionTask(collectionTask)
        }] : [])];
        await createAuditTrailLog(auditEntries, { transaction: tx });
        return { salesOrder, invoice: createdInvoice, collectionTask };
      }, { timeout: 20_000 });
  } catch (error) {
    if (storedDocument) await deleteCustomerPoDocument(storedDocument.storedName).catch(() => undefined);
    if (error instanceof InquiryConversionConflictError) {
      redirectWithMessage(basePath, "error", "Customer Inquiry was already converted by another request");
    }
    if (error instanceof Error && error.message === "ORDER_PRODUCT_UNAVAILABLE") {
      redirectWithMessage(`${basePath}?mode=create`, "error", "A selected Product is no longer active");
    }
    if (error instanceof Error && error.message === "INQUIRY_PRICE_CONFLICT") {
      redirectWithMessage(
        `${basePath}?mode=create&inquiryId=${encodeURIComponent(inquiryId)}`,
        "error",
        "Inquiry pricing changed. Refresh the conversion form and try again"
      );
    }
    if (isUniqueFieldCollision(error, "idempotency_key") || isUniqueFieldCollision(error, "idempotencyKey")) {
      const existing = await prisma.salesOrder.findUnique({ where: { idempotencyKey }, select: { id: true } });
      if (existing) redirectWithMessage(`${basePath}?view=${existing.id}`, "success", `${orderLabel} already created`);
    }
    if (isUniqueFieldCollision(error, "customer_po_number") || isUniqueFieldCollision(error, "customerPoNumber")) {
      redirectWithMessage(`${basePath}?mode=create`, "error", "Customer PO Number is already used. Enter a different number or leave it blank to generate automatically");
    }
    throw error;
  }

  refreshApp();
  if (needsApproval) {
    redirectWithMessage(`${basePath}?tab=approval`, "success", `${orderLabel} submitted for Manager approval`);
  }
  if (!result.invoice) {
    redirectWithMessage(`${basePath}?view=${result.salesOrder.id}`, "success", `${orderLabel} created. Admin or Manager can generate the invoice`);
  }
  redirect(`/invoices?view=${result.invoice.id}&success=${encodeURIComponent(`${orderLabel} confirmed and invoice generated`)}`);
}

export async function updateCustomerPoDraftMetadata(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CREATE_SALES_ORDER")) {
    redirectWithMessage("/customer-purchase-orders", "error", "You cannot edit Customer PO drafts");
  }
  const portfolio = buildPortfolioScope(currentUser);
  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const version = Number(getRequiredString(formData, "version"));
  const requiredDate = parseDateInput(getRequiredString(formData, "requiredDate"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const fileEntry = formData.get("customerPoDocument");
  const hasReplacement = fileEntry instanceof File && fileEntry.size > 0;
  const validatedDocument = hasReplacement
    ? await validateCustomerPoDocument(fileEntry)
    : null;
  if (!salesOrderId || !Number.isSafeInteger(version) || version < 1 || !requiredDate) {
    redirectWithMessage(`/customer-purchase-orders/${salesOrderId}`, "error", "A valid Draft version and required date are required");
  }
  if (hasReplacement && !validatedDocument) {
    redirectWithMessage(`/customer-purchase-orders/${salesOrderId}`, "error", "Replacement document must be a valid PDF up to 8 MB");
  }

  const replacement = validatedDocument
    ? await uploadCustomerPoDocument(validatedDocument)
    : null;
  let previousStoredName: string | null = null;
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.salesOrder.findFirst({
        where: { id: salesOrderId, source: "CUSTOMER_PO", ...portfolio.salesOrderWhere },
        include: {
          invoice: { select: { id: true } },
          pickingList: { select: { id: true } },
          deliveryNotes: { select: { id: true } },
          deliverySources: { select: { id: true } }
        }
      });
      if (!current) throw new Error("CUSTOMER_PO_NOT_FOUND");
      if (
        current.status !== "Draft" || current.version !== version || current.invoice ||
        current.pickingList || current.deliveryNotes.length || current.deliverySources.length
      ) {
        throw new Error("CUSTOMER_PO_DRAFT_CONFLICT");
      }
      previousStoredName = current.customerPoDocumentStoredName;
      const updated = await tx.salesOrder.updateMany({
        where: { id: current.id, source: "CUSTOMER_PO", status: "Draft", version },
        data: {
          requiredDate,
          version: { increment: 1 },
          ...(replacement ? {
            customerPoDocumentName: replacement.originalName,
            customerPoDocumentStoredName: replacement.storedName,
            customerPoDocumentMimeType: replacement.mimeType,
            customerPoDocumentSize: replacement.size,
            customerPoDocumentSha256: replacement.sha256
          } : {})
        }
      });
      if (updated.count !== 1) throw new Error("CUSTOMER_PO_DRAFT_CONFLICT");
      await createAuditTrailLog({
        actor: currentUser,
        moduleName: "Customer Purchase Orders",
        entityType: "SALES_ORDER",
        entityId: current.id,
        recordReference: current.customerPoNumber ?? current.orderNumber,
        action: "DRAFT_UPDATED",
        actionNote,
        changeSummary: `Customer PO Draft ${current.customerPoNumber ?? current.orderNumber} metadata updated`,
        oldValue: {
          version: current.version,
          requiredDate: current.requiredDate,
          documentName: current.customerPoDocumentName
        },
        newValue: {
          version: current.version + 1,
          requiredDate,
          documentName: replacement?.originalName ?? current.customerPoDocumentName
        }
      }, { transaction: tx });
    });
  } catch (error) {
    if (replacement) await deleteCustomerPoDocument(replacement.storedName).catch(() => undefined);
    if (error instanceof Error && error.message === "CUSTOMER_PO_NOT_FOUND") {
      redirectWithMessage("/customer-purchase-orders", "error", "Customer PO was not found");
    }
    if (error instanceof Error && error.message === "CUSTOMER_PO_DRAFT_CONFLICT") {
      redirectWithMessage(`/customer-purchase-orders/${salesOrderId}`, "error", "Customer PO changed or is already locked; refresh before editing");
    }
    throw error;
  }
  if (replacement && previousStoredName && previousStoredName !== replacement.storedName) {
    await deleteCustomerPoDocument(previousStoredName).catch(() => undefined);
  }
  refreshApp();
  redirectWithMessage(`/customer-purchase-orders/${salesOrderId}`, "success", "Customer PO Draft metadata updated");
}

export async function deleteSalesOrder(formData: FormData) {
  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const requestedBasePath = getString(formData, "returnPath") === "/customer-purchase-orders"
    ? "/customer-purchase-orders"
    : "/sales-orders";
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const currentUser = await requireCurrentUser();

  if (!canRole(currentUser?.role, "DELETE_SALES_ORDER")) {
    redirectWithMessage(
      `${requestedBasePath}/${salesOrderId}`,
      "error",
      "Only Admin and Manager roles can delete ongoing Sales Orders"
    );
  }

  if (!actionNote) {
    redirectWithMessage(
      `${requestedBasePath}/${salesOrderId}`,
      "error",
      "A confirmation note is required to delete a Sales Order"
    );
  }

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      invoice: {
        include: {
          payments: true,
          collectionTasks: true,
          deliveryNotes: { select: { id: true, status: true } }
        }
      },
      deliveryNotes: { select: { id: true, status: true } },
      pickingList: { select: { id: true } },
      customerInquiry: { select: { id: true } },
      items: { select: { id: true } }
    }
  });

  if (!salesOrder) {
    redirectWithMessage(requestedBasePath, "error", "Order was not found");
  }

  const isCustomerPo = salesOrder.source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";

  if (
    !canDeleteOngoingSalesOrder({
      salesOrderStatus: salesOrder.status,
      hasPickingList: Boolean(salesOrder.pickingList),
      hasInquiry: Boolean(salesOrder.customerInquiry),
      hasItemRevisions: salesOrder.revisionNumber > 1,
      invoiceStatus: salesOrder.invoice?.status,
      deliveryNoteStatuses: [
        ...salesOrder.deliveryNotes,
        ...(salesOrder.invoice?.deliveryNotes ?? [])
      ].map((note) => note.status)
    })
  ) {
    redirectWithMessage(
      `${basePath}/${salesOrder.id}`,
      "error",
      "Only an unlinked Draft without invoice, inquiry, Picking List, delivery history or item revisions can be deleted"
    );
  }

  const deletedSummary = {
    orderNumber: salesOrder.orderNumber,
    status: salesOrder.status,
    invoiceNumber: salesOrder.invoice?.invoiceNumber ?? null,
    itemCount: salesOrder.items.length,
    paymentCount: salesOrder.invoice?.payments.length ?? 0,
    collectionTaskCount: salesOrder.invoice?.collectionTasks.length ?? 0,
    deliveryNoteCount: new Set([
      ...salesOrder.deliveryNotes.map((note) => note.id),
      ...(salesOrder.invoice?.deliveryNotes ?? []).map((note) => note.id)
    ]).size
  };

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrder.id} FOR UPDATE`;
    const current = await tx.salesOrder.findUnique({
      where: { id: salesOrder.id },
      include: {
        invoice: { select: { id: true, status: true } },
        deliveryNotes: { select: { status: true } },
        deliverySources: { select: { id: true } },
        pickingList: { select: { id: true } },
        customerInquiry: { select: { id: true } }
      }
    });
    if (!current || current.deliverySources.length > 0 || !canDeleteOngoingSalesOrder({
      salesOrderStatus: current.status,
      invoiceStatus: current.invoice?.status,
      deliveryNoteStatuses: current.deliveryNotes.map(note => note.status),
      hasPickingList: Boolean(current.pickingList),
      hasInquiry: Boolean(current.customerInquiry),
      hasItemRevisions: current.revisionNumber > 1,
    })) {
      throw new Error("SALES_ORDER_DELETE_CONFLICT");
    }
    await tx.salesOrder.delete({ where: { id: current.id } });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: current.id,
      recordReference: current.orderNumber,
      action: "DELETED",
      actionNote,
      changeSummary: `Disposable Draft ${orderLabel.toLowerCase()} ${current.orderNumber} deleted`,
      oldValue: deletedSummary
    }, { transaction: tx });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "SALES_ORDER_DELETE_CONFLICT") {
      redirectWithMessage(`${basePath}/${salesOrder.id}`, "error", "The order changed or is no longer a disposable Draft");
    }
    throw error;
  });

  if (salesOrder.customerPoDocumentStoredName) {
    await deleteCustomerPoDocument(salesOrder.customerPoDocumentStoredName).catch(() => undefined);
  }

  refreshApp();
  redirectWithMessage(
    basePath,
    "success",
    `${orderLabel} ${salesOrder.orderNumber} Draft was deleted`
  );
}

export async function generateInvoice(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  if (!canRole(currentUser?.role, "CREATE_INVOICE")) {
    redirectWithMessage(
      "/sales-orders",
      "error",
      "Only Admin and Manager roles can create Invoices"
    );
  }

  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const orderReference = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      source: true,
      status: true,
      approvalStatus: true,
      invoice: { select: { id: true } }
    }
  });

  if (!orderReference) {
    redirectWithMessage("/sales-orders", "error", "Sales order was not found");
  }
  const isCustomerPo = orderReference.source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";
  if (!canGenerateInvoiceForOrder({
    status: orderReference.status,
    approvalStatus: orderReference.approvalStatus,
    hasInvoice: Boolean(orderReference.invoice)
  })) {
    redirectWithMessage(basePath, "error", "Only a confirmed, approved order without an invoice can be invoiced");
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "sales_orders" WHERE "id" = ${salesOrderId} FOR UPDATE`;
      const salesOrder = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: { invoice: true, customer: true, items: true }
      });
      if (!salesOrder || !canGenerateInvoiceForOrder({
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        hasInvoice: Boolean(salesOrder.invoice)
      })) {
        throw new InvoiceGenerationConflictError();
      }
      const issueDate = new Date();
      const invoiceNumber = await allocateDocumentNumber(
        "INV",
        getJakartaDocumentYear(issueDate),
        tx
      );
      const dueDate = getDueDateForPaymentTerm({
        issueDate,
        paymentTermType: salesOrder.paymentTermType,
        creditTermMonths: salesOrder.creditTermMonths,
        creditTermWeeks: salesOrder.creditTermWeeks
      });
      const createdInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          salesOrderId: salesOrder.id,
          customerId: salesOrder.customerId,
          issueDate,
          dueDate,
          totalAmount: salesOrder.total,
          paidAmount: 0,
          remainingAmount: salesOrder.total,
          customerNpwpSnapshot: salesOrder.customerNpwpSnapshot,
          ppnApplied: salesOrder.ppnApplied,
          ppnRateBasisPoints: salesOrder.ppnRateBasisPoints,
          ppnAmount: salesOrder.ppnAmount,
          netSalesAmount: salesOrder.netSalesAmount,
          ...buildInvoiceSnapshot(salesOrder),
          paymentTermType: salesOrder.paymentTermType,
          creditTermMonths: salesOrder.creditTermMonths,
          creditTermWeeks: salesOrder.creditTermWeeks,
          status: "Unpaid",
          notes: actionNote || null
        }
      });
      const claimedOrder = await tx.salesOrder.updateMany({
        where: { id: salesOrder.id, version: salesOrder.version, status: "Confirmed" },
        data: {
          status: "Invoiced",
          version: { increment: 1 },
          notes: mergeActionNotes(salesOrder.notes, actionNote)
        }
      });
      if (claimedOrder.count !== 1) throw new InvoiceGenerationConflictError();
      const updatedSalesOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrder.id } });
      const collectionTask = salesOrder.paymentTermType === "CREDIT"
        ? await tx.collectionTask.create({
            data: {
              customerId: salesOrder.customerId,
              invoiceId: createdInvoice.id,
              scheduledDate: dueDate,
              status: "Planned",
              notes: `Credit payment collection reminder for ${invoiceNumber}`
            }
          })
        : null;
      await createAuditTrailLog([
        {
          actor: currentUser,
          moduleName: "Invoices",
          entityType: "INVOICE",
          entityId: createdInvoice.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Invoice ${createdInvoice.invoiceNumber} generated from ${orderLabel.toLowerCase()} ${salesOrder.orderNumber}`,
          newValue: summarizeInvoice(createdInvoice)
        },
        {
          actor: currentUser,
          moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
          entityType: "SALES_ORDER",
          entityId: updatedSalesOrder.id,
          recordReference: updatedSalesOrder.orderNumber,
          action: "STATUS_CHANGED",
          actionNote,
          changeSummary: `${orderLabel} status changed to ${updatedSalesOrder.status}`,
          oldValue: { status: salesOrder.status },
          newValue: { status: updatedSalesOrder.status }
        },
        {
          actor: currentUser,
          moduleName: "Receivables",
          entityType: "RECEIVABLE",
          entityId: createdInvoice.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Receivable created from invoice ${createdInvoice.invoiceNumber}`,
          newValue: summarizeInvoice(createdInvoice)
        },
        ...(collectionTask ? [{
          actor: currentUser,
          moduleName: "Collections",
          entityType: "COLLECTION_TASK",
          entityId: collectionTask.id,
          recordReference: createdInvoice.invoiceNumber,
          action: "CREATED",
          actionNote,
          changeSummary: `Credit payment collection task created for invoice ${createdInvoice.invoiceNumber}`,
          newValue: summarizeCollectionTask(collectionTask)
        }] : [])
      ], { transaction: tx });
      return { invoice: createdInvoice, salesOrder: updatedSalesOrder, collectionTask };
    });
  } catch (error) {
    if (
      error instanceof InvoiceGenerationConflictError ||
      isUniqueFieldCollision(error, "sales_order_id") ||
      isUniqueFieldCollision(error, "salesOrderId")
    ) {
      redirectWithMessage(basePath, "error", "This order changed or already has an invoice");
    }
    throw error;
  }

  refreshApp();
  redirect(`/invoices?view=${result.invoice.id}&success=${encodeURIComponent("Invoice generated")}`);
}

export async function decideSalesOrderApproval(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const requestedBasePath = getString(formData, "returnPath") === "/customer-purchase-orders"
    ? "/customer-purchase-orders"
    : "/sales-orders";
  if (!currentUser || currentUser.role !== "MANAGER") {
    redirectWithMessage(
      `${requestedBasePath}?tab=approval`,
      "error",
      "Only a Manager can approve or reject sales orders"
    );
  }

  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const expectedVersion = Number(getRequiredString(formData, "expectedVersion"));
  const decisionValue = getString(formData, "decision");
  if (
    (decisionValue !== "Approved" && decisionValue !== "Rejected") ||
    !Number.isSafeInteger(expectedVersion) || expectedVersion < 1
  ) {
    redirectWithMessage(
      `${requestedBasePath}?tab=approval`,
      "error",
      "Choose Approve or Reject for the current sales order version"
    );
  }
  const decision: SalesOrderApprovalStatus = decisionValue;
  let actionNote: string;
  let decisionNote: string;
  try {
    actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
    const submittedDecisionNote = getString(formData, "decisionNote");
    decisionNote = normalizeActionNote(
      decision === "Rejected"
        ? submittedDecisionNote || actionNote
        : submittedDecisionNote,
      requiresApprovalDecisionNote(decision) ? "required" : "optional"
    );
  } catch (error) {
    if (error instanceof ActionNoteValidationError) {
      redirectWithMessage(
        `${requestedBasePath}?tab=approval`,
        "error",
        error.message === "A reason is required for this action"
          ? "A rejection reason is required"
          : error.message
      );
    }
    throw error;
  }
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { invoice: true, customer: true }
  });

  if (!salesOrder) {
    redirectWithMessage(`${requestedBasePath}?tab=approval`, "error", "Order was not found");
  }
  const isCustomerPo = salesOrder.source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";
  if (salesOrder.approvalStatus !== "Pending") {
    redirectWithMessage(
      `${basePath}?tab=approval`,
      "error",
      "This sales order is no longer waiting for approval"
    );
  }
  if (salesOrder.invoice) {
    redirectWithMessage(
      `${basePath}?tab=approval`,
      "error",
      "This sales order already has an invoice"
    );
  }

  if (decision === "Rejected") {
    await (async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "sales_orders" WHERE "id" = ${salesOrder.id} FOR UPDATE`;
          const currentOrder = await tx.salesOrder.findUnique({
            where: { id: salesOrder.id },
            include: { invoice: true, customer: true }
          });
          if (
            !currentOrder || currentOrder.version !== expectedVersion ||
            currentOrder.status !== "Draft" || currentOrder.approvalStatus !== "Pending" ||
            currentOrder.invoice || currentOrder.customer.status !== "Active"
          ) {
            throw new SalesOrderApprovalConflictError();
          }
          const claimedDecision = await tx.salesOrder.updateMany({
            where: {
              id: currentOrder.id,
              version: expectedVersion,
              status: "Draft",
              approvalStatus: "Pending"
            },
            data: {
              status: "Cancelled",
              approvalStatus: "Rejected",
              approvalDecisionNote: decisionNote || null,
              approvalDecidedAt: new Date(),
              approvalDecidedById: currentUser.id,
              notes: mergeActionNotes(currentOrder.notes, decisionNote),
              version: { increment: 1 }
            }
          });

          if (claimedDecision.count !== 1) {
            throw new SalesOrderApprovalConflictError();
          }

          const rejected = await tx.salesOrder.findUniqueOrThrow({
            where: { id: salesOrder.id }
          });
          await createAuditTrailLog({
            actor: currentUser,
            moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
            entityType: "SALES_ORDER",
            entityId: rejected.id,
            recordReference: rejected.orderNumber,
            action: "REJECTED",
            actionNote: decisionNote,
            changeSummary: `Manager rejected ${orderLabel.toLowerCase()} ${rejected.orderNumber}`,
            oldValue: { status: currentOrder.status, approvalStatus: currentOrder.approvalStatus, version: currentOrder.version },
            newValue: {
              status: rejected.status,
              approvalStatus: rejected.approvalStatus,
              decisionNote: rejected.approvalDecisionNote,
              version: rejected.version
            }
          }, { transaction: tx });
          return rejected;
        });
      } catch (error) {
        if (error instanceof SalesOrderApprovalConflictError) {
          redirectWithMessage(
            `${basePath}?tab=approval`,
            "error",
            "This sales order is no longer waiting for approval"
          );
        }
        throw error;
      }
    })();

    refreshApp();
    redirectWithMessage(`${basePath}?tab=approval`, "success", `${orderLabel} rejected`);
  }

  const issueDate = new Date();
  await (async () => {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "sales_orders" WHERE "id" = ${salesOrder.id} FOR UPDATE`;
        const currentOrder = await tx.salesOrder.findUnique({
          where: { id: salesOrder.id },
          include: {
            invoice: true,
            customer: {
              include: { invoices: { select: customerInvoiceBalanceSelect } }
            },
            items: true
          }
        });
        if (
          !currentOrder || currentOrder.version !== expectedVersion ||
          currentOrder.status !== "Draft" || currentOrder.approvalStatus !== "Pending" ||
          currentOrder.invoice || currentOrder.customer.status !== "Active"
        ) {
          throw new SalesOrderApprovalConflictError();
        }
        const invoiceNumber = await allocateDocumentNumber(
          "INV",
          getJakartaDocumentYear(issueDate),
          tx
        );
        const currentPaymentSummary = getCustomerPaymentSummary(currentOrder.customer);
        const dueDate = getDueDateForPaymentTerm({
          issueDate,
          paymentTermType: currentOrder.paymentTermType,
          creditTermMonths: currentOrder.creditTermMonths,
          creditTermWeeks: currentOrder.creditTermWeeks
        });
        const claimedDecision = await tx.salesOrder.updateMany({
          where: {
            id: currentOrder.id,
            version: expectedVersion,
            status: "Draft",
            approvalStatus: "Pending"
          },
          data: {
            status: "Invoiced",
            approvalStatus: "Approved",
            approvalRisk: currentPaymentSummary.paymentStatus,
            approvalDecisionNote: decisionNote || null,
            approvalDecidedAt: issueDate,
            approvalDecidedById: currentUser.id,
            notes: mergeActionNotes(currentOrder.notes, actionNote),
            version: { increment: 1 }
          }
        });
        if (claimedDecision.count !== 1) throw new SalesOrderApprovalConflictError();
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            salesOrderId: currentOrder.id,
            customerId: currentOrder.customerId,
            issueDate,
            dueDate,
            totalAmount: currentOrder.total,
            paidAmount: 0,
            remainingAmount: currentOrder.total,
            customerNpwpSnapshot: currentOrder.customerNpwpSnapshot,
            ppnApplied: currentOrder.ppnApplied,
            ppnRateBasisPoints: currentOrder.ppnRateBasisPoints,
            ppnAmount: currentOrder.ppnAmount,
            netSalesAmount: currentOrder.netSalesAmount,
            ...buildInvoiceSnapshot(currentOrder),
            paymentTermType: currentOrder.paymentTermType,
            creditTermMonths: currentOrder.creditTermMonths,
            creditTermWeeks: currentOrder.creditTermWeeks,
            status: "Unpaid",
            notes: actionNote || null
          }
        });
        const approvedOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: currentOrder.id } });
        const collectionTask = currentOrder.paymentTermType === "CREDIT"
          ? await tx.collectionTask.create({
              data: {
                customerId: currentOrder.customerId,
                invoiceId: invoice.id,
                scheduledDate: dueDate,
                status: "Planned",
                notes: `Credit payment collection reminder for ${invoiceNumber}`
              }
            })
          : null;
        await createAuditTrailLog([
          {
            actor: currentUser,
            moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
            entityType: "SALES_ORDER",
            entityId: approvedOrder.id,
            recordReference: approvedOrder.orderNumber,
            action: "APPROVED",
            actionNote,
            changeSummary: `Manager approved ${orderLabel.toLowerCase()} ${approvedOrder.orderNumber}`,
            oldValue: { status: currentOrder.status, approvalStatus: currentOrder.approvalStatus, version: currentOrder.version },
            newValue: {
              status: approvedOrder.status,
              approvalStatus: approvedOrder.approvalStatus,
              decisionNote: approvedOrder.approvalDecisionNote,
              version: approvedOrder.version,
              paymentStatusAtDecision: currentPaymentSummary.paymentStatus,
              outstandingAtDecision: currentPaymentSummary.outstandingAmount
            }
          },
          {
            actor: currentUser,
            moduleName: "Invoices",
            entityType: "INVOICE",
            entityId: invoice.id,
            recordReference: invoice.invoiceNumber,
            action: "CREATED",
            actionNote,
            changeSummary: `Invoice ${invoice.invoiceNumber} generated after Manager approval of ${approvedOrder.orderNumber}`,
            newValue: summarizeInvoice(invoice)
          },
          {
            actor: currentUser,
            moduleName: "Receivables",
            entityType: "RECEIVABLE",
            entityId: invoice.id,
            recordReference: invoice.invoiceNumber,
            action: "CREATED",
            actionNote,
            changeSummary: `Receivable created from invoice ${invoice.invoiceNumber}`,
            newValue: summarizeInvoice(invoice)
          },
          ...(collectionTask ? [{
            actor: currentUser,
            moduleName: "Collections",
            entityType: "COLLECTION_TASK",
            entityId: collectionTask.id,
            recordReference: invoice.invoiceNumber,
            action: "CREATED",
            actionNote,
            changeSummary: `Credit payment collection task created for invoice ${invoice.invoiceNumber}`,
            newValue: summarizeCollectionTask(collectionTask)
          }] : [])
        ], { transaction: tx });
        return { invoice, salesOrder: approvedOrder, collectionTask };
      });
    } catch (error) {
      if (error instanceof SalesOrderApprovalConflictError) {
        redirectWithMessage(
          `${basePath}?tab=approval`,
          "error",
          "This sales order is no longer waiting for approval"
        );
      }
      throw error;
    }
  })();

  refreshApp();
  redirectWithMessage(
    `${basePath}?tab=approval`,
    "success",
    `${orderLabel} approved and invoice generated`
  );
}

export async function recordPayment(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  if (!canRole(currentUser?.role, "RECORD_PAYMENT")) {
    redirectWithMessage(
      "/payments",
      "error",
      "Only Admin and Manager roles can record Payments"
    );
  }

  const invoiceId = getRequiredString(formData, "invoiceId");
  const amount = parseRupiahAmount(formData.get("amount"));
  const paymentDate = new Date(getString(formData, "paymentDate") || new Date());
  const paymentMethod = parsePaymentMethod(formData.get("paymentMethod"));

  if (!invoiceId || amount === null || amount <= 0 || Number.isNaN(paymentDate.getTime()) || !paymentMethod) {
    redirectWithMessage(
      "/payments",
      "error",
      "Select an invoice, enter a payment amount, and choose a valid payment method"
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const recorded = await recordInvoicePayment(tx, {
        invoiceId,
        paymentDate,
        amount,
        paymentMethod,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote)
      });
      const invoice = recorded.previousInvoice;
      await createAuditTrailLog([
        {
          actor: currentUser,
          moduleName: "Payments",
          entityType: "PAYMENT",
          entityId: recorded.payment.id,
          recordReference: invoice.invoiceNumber,
          action: "PAYMENT_RECORDED",
          actionNote,
          changeSummary: `Payment recorded for invoice ${invoice.invoiceNumber}`,
          oldValue: {
            invoiceNumber: invoice.invoiceNumber,
            paidAmount: invoice.paidAmount,
            remainingAmount: invoice.remainingAmount,
            status: invoice.status
          },
          newValue: {
            paymentId: recorded.payment.id,
            amount: recorded.payment.amount,
            paymentMethod: recorded.payment.paymentMethod,
            notes: recorded.payment.notes,
            paidAmount: recorded.invoice.paidAmount,
            remainingAmount: recorded.invoice.remainingAmount,
            status: recorded.invoice.status
          }
        },
        ...(invoice.status !== recorded.invoice.status ? [{
          actor: currentUser,
          moduleName: "Invoices",
          entityType: "INVOICE",
          entityId: recorded.invoice.id,
          recordReference: invoice.invoiceNumber,
          action: "STATUS_CHANGED",
          actionNote,
          changeSummary: `Invoice status changed from ${invoice.status} to ${recorded.invoice.status}`,
          oldValue: summarizeInvoice(invoice),
          newValue: summarizeInvoice(recorded.invoice)
        }] : []),
        {
          actor: currentUser,
          moduleName: "Receivables",
          entityType: "RECEIVABLE",
          entityId: recorded.invoice.id,
          recordReference: invoice.invoiceNumber,
          action: recorded.invoice.remainingAmount <= 0 ? "RECEIVABLE_CLOSED" : "STATUS_CHANGED",
          actionNote,
          changeSummary: recorded.invoice.remainingAmount <= 0
            ? `Receivable closed for invoice ${invoice.invoiceNumber}`
            : `Receivable updated for invoice ${invoice.invoiceNumber}`,
          oldValue: summarizeInvoice(invoice),
          newValue: summarizeInvoice(recorded.invoice)
        },
        ...recorded.closedCollectionTasks.map(({ previous, current }) => ({
          actor: currentUser,
          moduleName: "Collections",
          entityType: "COLLECTION_TASK",
          entityId: current.id,
          recordReference: invoice.invoiceNumber,
          action: "STATUS_CHANGED",
          actionNote: "Automatically completed because the linked invoice was paid in full.",
          changeSummary: `Collection task automatically completed after invoice ${invoice.invoiceNumber} was paid in full`,
          oldValue: summarizeCollectionTask(previous),
          newValue: summarizeCollectionTask(current)
        }))
      ], { transaction: tx });
      return recorded;
    });
  } catch (error) {
    if (error instanceof PaymentRecordingError) {
      if (error.code === "INVOICE_NOT_FOUND") {
        redirectWithMessage("/payments", "error", "Invoice was not found");
      }
      if (error.code === "INVOICE_CANCELLED") {
        redirectWithMessage(
          "/payments",
          "error",
          "Cancelled invoices cannot receive payments"
        );
      }
      redirectWithMessage(
        "/payments",
        "error",
        "Payment cannot exceed remaining invoice amount"
      );
    }
    throw error;
  }
  refreshApp();
  redirectWithMessage(`/payments?invoiceId=${invoiceId}`, "success", "Payment recorded");
}

export async function cancelInvoice(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CANCEL_INVOICE")) {
    redirectWithMessage(
      "/invoices",
      "error",
      "Only Admin and Manager roles can cancel Invoices"
    );
  }

  const invoiceId = getRequiredString(formData, "invoiceId");
  const expectedVersion = Number(getRequiredString(formData, "expectedVersion"));
  let cancellationReason: string;
  try {
    cancellationReason = normalizeActionNote(
      getString(formData, "cancellationReason"),
      "required"
    );
  } catch (error) {
    if (error instanceof ActionNoteValidationError) {
      redirectWithMessage(
        `/invoices?view=${invoiceId}`,
        "error",
        error.message
      );
    }
    throw error;
  }

  if (!invoiceId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    redirectWithMessage(
      `/invoices?view=${invoiceId}`,
      "error",
      "The invoice version is invalid. Refresh and try again."
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId} FOR UPDATE`);
      const currentInvoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          payments: { select: { id: true }, take: 1 },
          collectionTasks: {
            where: { status: "Planned" },
            select: { id: true }
          }
        }
      });

      if (
        !currentInvoice ||
        currentInvoice.version !== expectedVersion ||
        !canCancelInvoice({
          status: currentInvoice.status,
          paidAmount: currentInvoice.paidAmount,
          paymentCount: currentInvoice.payments.length
        })
      ) {
        throw new InvoiceCancellationConflictError();
      }

      const claimedCancellation = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          version: expectedVersion,
          status: "Unpaid",
          paidAmount: 0
        },
        data: {
          status: "Cancelled",
          version: { increment: 1 },
          cancellationReason,
          cancelledAt: new Date(),
          cancelledByUserId: currentUser.id,
          notes: mergeActionNotes(currentInvoice.notes, cancellationReason)
        }
      });
      if (claimedCancellation.count !== 1) {
        throw new InvoiceCancellationConflictError();
      }

      if (currentInvoice.collectionTasks.length > 0) {
        await tx.collectionTask.updateMany({
          where: {
            id: { in: currentInvoice.collectionTasks.map(task => task.id) },
            status: "Planned"
          },
          data: { status: "Cancelled", version: { increment: 1 } }
        });
      }
      const cancelledInvoice = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId }
      });
      await createAuditTrailLog([
        {
          actor: currentUser,
          moduleName: "Invoices",
          entityType: "INVOICE",
          entityId: cancelledInvoice.id,
          recordReference: cancelledInvoice.invoiceNumber,
          action: "CANCELLED",
          actionNote: cancellationReason,
          changeSummary: `Invoice ${cancelledInvoice.invoiceNumber} cancelled`,
          oldValue: summarizeInvoice(currentInvoice),
          newValue: summarizeInvoice(cancelledInvoice)
        },
        {
          actor: currentUser,
          moduleName: "Receivables",
          entityType: "RECEIVABLE",
          entityId: cancelledInvoice.id,
          recordReference: cancelledInvoice.invoiceNumber,
          action: "RECEIVABLE_CLOSED",
          actionNote: cancellationReason,
          changeSummary: `Receivable cancelled for invoice ${cancelledInvoice.invoiceNumber}`,
          oldValue: summarizeInvoice(currentInvoice),
          newValue: summarizeInvoice(cancelledInvoice)
        }
      ], { transaction: tx });
    });
  } catch (error) {
    if (error instanceof InvoiceCancellationConflictError) {
      redirectWithMessage(
        `/invoices?view=${invoiceId}`,
        "error",
        "Only an unpaid invoice with no recorded payments can be cancelled"
      );
    }
    throw error;
  }

  refreshApp();
  redirectWithMessage(
    "/invoices?tab=done",
    "success",
    "Invoice cancelled"
  );
}

export async function updateInvoiceNotes(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const id = getRequiredString(formData, "id");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id) {
    redirectWithMessage("/invoices", "error", "Invoice ID is required");
  }

  const oldInvoice = await prisma.invoice.findFirst({
    where: { id, ...portfolio.invoiceWhere }
  });

  if (!oldInvoice) {
    redirectWithMessage("/invoices", "error", "Invoice was not found");
  }

  await prisma.$transaction(async tx => {
    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        notes: mergeActionNotes(getString(formData, "notes"), actionNote)
      }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Invoices",
      entityType: "INVOICE",
      entityId: invoice.id,
      recordReference: invoice.invoiceNumber,
      action: "NOTE_UPDATED",
      actionNote,
      changeSummary: `Invoice notes updated for ${invoice.invoiceNumber}`,
      oldValue: { notes: oldInvoice.notes },
      newValue: { notes: invoice.notes }
    }, { transaction: tx });
  });

  refreshApp();
  redirect(`/invoices?view=${id}&success=${encodeURIComponent("Invoice notes updated")}`);
}

export async function createCollectionTask(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const customerId = getRequiredString(formData, "customerId");
  const invoiceId = getString(formData, "invoiceId");
  const scheduledDate = parseDateOnly(getRequiredString(formData, "scheduledDate"));
  const requestedStatus = getRequiredString(formData, "status");
  const notes = getRequiredString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!customerId || !notes || !scheduledDate || requestedStatus !== "Planned") {
    redirectWithMessage("/collections", "error", "Customer, a valid date, Planned status, and notes are required");
  }

  await prisma.$transaction(async tx => {
    const [customer, invoice] = await Promise.all([
      tx.customer.findFirst({
        where: { id: customerId, ...portfolio.customerWhere },
        select: { id: true }
      }),
      invoiceId
        ? tx.invoice.findFirst({
          where: {
            id: invoiceId,
            customerId,
            ...portfolio.invoiceWhere
          },
          select: { id: true }
        })
        : Promise.resolve(null)
    ]);
    if (!customer || (invoiceId && !invoice)) {
      redirectWithMessage("/collections", "error", "Customer or invoice is outside your portfolio");
    }

    const created = await tx.collectionTask.create({
      data: {
        customerId,
        invoiceId: invoiceId || null,
        scheduledDate,
        status: "Planned",
        notes: mergeActionNotes(notes, actionNote) ?? notes
      },
      include: { customer: true, invoice: true }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Collections",
      entityType: "COLLECTION_TASK",
      entityId: created.id,
      recordReference: created.invoice?.invoiceNumber ?? created.customer.companyName ?? created.id,
      action: "CREATED",
      actionNote,
      changeSummary: `Collection task created for ${created.invoice?.invoiceNumber ?? created.customer.companyName}`,
      newValue: summarizeCollectionTask(created)
    }, { transaction: tx });
    return created;
  });

  refreshApp();
  redirectWithMessage("/collections", "success", "Collection task added");
}

export async function updateCollectionTask(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const taskId = getRequiredString(formData, "taskId");
  const expectedVersion = parseCollectionTaskVersion(formData.get("expectedVersion"));
  const scheduledDate = parseDateOnly(getRequiredString(formData, "scheduledDate"));
  const notes = getRequiredString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!taskId || !expectedVersion || !scheduledDate || !notes) {
    redirectWithMessage(
      "/collections",
      "error",
      "A current Planned task, valid date, and notes are required"
    );
  }

  try {
    await prisma.$transaction(async tx => {
      const existing = await tx.collectionTask.findFirst({
        where: { id: taskId, ...portfolio.collectionTaskWhere },
        include: { customer: true, invoice: true }
      });
      if (
        !existing ||
        existing.status !== "Planned" ||
        existing.version !== expectedVersion
      ) {
        throw new CollectionTaskConflictError();
      }

      const claimed = await tx.collectionTask.updateMany({
        where: { id: taskId, status: "Planned", version: expectedVersion },
        data: {
          scheduledDate,
          notes,
          version: { increment: 1 }
        }
      });
      if (claimed.count !== 1) throw new CollectionTaskConflictError();

      const updated = await tx.collectionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { customer: true, invoice: true }
      });
      await createAuditTrailLog({
        actor: currentUser,
        moduleName: "Collections",
        entityType: "COLLECTION_TASK",
        entityId: updated.id,
        recordReference: updated.invoice?.invoiceNumber ?? updated.customer.companyName,
        action: "UPDATED",
        actionNote,
        changeSummary: `Collection task schedule updated for ${updated.invoice?.invoiceNumber ?? updated.customer.companyName}`,
        oldValue: summarizeCollectionTask(existing),
        newValue: summarizeCollectionTask(updated)
      }, { transaction: tx });
    });
  } catch (error) {
    if (error instanceof CollectionTaskConflictError) {
      redirectWithMessage(
        "/collections",
        "error",
        "Collection task changed in another session. Refresh and try again"
      );
    }
    throw error;
  }

  refreshApp();
  redirectWithMessage("/collections", "success", "Collection task updated");
}

export async function transitionCollectionTask(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const taskId = getRequiredString(formData, "taskId");
  const expectedVersion = parseCollectionTaskVersion(formData.get("expectedVersion"));
  const nextStatus = parseCollectionTaskTransition(formData.get("status"));
  let actionNote: string | null;
  try {
    actionNote = normalizeActionNote(
      getString(formData, "confirmationNote"),
      "required"
    );
  } catch (error) {
    if (error instanceof ActionNoteValidationError) {
      redirectWithMessage("/collections", "error", error.message);
    }
    throw error;
  }

  if (
    !taskId ||
    !expectedVersion ||
    !nextStatus ||
    ["scheduledDate", "notes", "customerId", "invoiceId"].some(field => formData.has(field))
  ) {
    redirectWithMessage(
      "/collections",
      "error",
      "Invalid Collection transition payload"
    );
  }

  try {
    await prisma.$transaction(async tx => {
      const existing = await tx.collectionTask.findFirst({
        where: { id: taskId, ...portfolio.collectionTaskWhere },
        include: { customer: true, invoice: true }
      });
      if (
        !existing ||
        existing.version !== expectedVersion ||
        !canTransitionCollectionTask(existing.status, nextStatus)
      ) {
        throw new CollectionTaskConflictError();
      }

      const claimed = await tx.collectionTask.updateMany({
        where: { id: taskId, status: "Planned", version: expectedVersion },
        data: { status: nextStatus, version: { increment: 1 } }
      });
      if (claimed.count !== 1) throw new CollectionTaskConflictError();

      const updated = await tx.collectionTask.findUniqueOrThrow({
        where: { id: taskId },
        include: { customer: true, invoice: true }
      });
      await createAuditTrailLog({
        actor: currentUser,
        moduleName: "Collections",
        entityType: "COLLECTION_TASK",
        entityId: updated.id,
        recordReference: updated.invoice?.invoiceNumber ?? updated.customer.companyName,
        action: nextStatus === "Done" ? "COMPLETED" : "CANCELLED",
        actionNote,
        changeSummary: `Collection task marked ${nextStatus.toLowerCase()} by ${currentUser.displayName}`,
        oldValue: summarizeCollectionTask(existing),
        newValue: summarizeCollectionTask(updated)
      }, { transaction: tx });
    });
  } catch (error) {
    if (error instanceof CollectionTaskConflictError) {
      redirectWithMessage(
        "/collections",
        "error",
        "Collection task changed in another session. Refresh and try again"
      );
    }
    throw error;
  }

  refreshApp();
  redirectWithMessage(
    "/collections?tab=done",
    "success",
    `Collection task marked ${nextStatus.toLowerCase()}`
  );
}

export async function recordCustomerOutreach(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const portfolio = buildPortfolioScope(currentUser);
  const customerId = getRequiredString(formData, "customerId");
  const contactDateValue = getRequiredString(formData, "contactDate");
  const contactDate = new Date(`${contactDateValue}T00:00:00`);
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!customerId || !contactDateValue || Number.isNaN(contactDate.getTime())) {
    redirectWithMessage(
      "/customer-outreach",
      "error",
      "Customer and a valid contact date are required"
    );
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...portfolio.customerWhere },
    select: { id: true, companyName: true, name: true }
  });

  if (!customer) {
    redirectWithMessage("/customer-outreach", "error", "Customer was not found");
  }

  await prisma.$transaction(async tx => {
    const created = await tx.customerOutreach.create({
      data: {
        customerId,
        contactDate,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote)
      }
    });
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Customer Outreach",
      entityType: "CUSTOMER_OUTREACH",
      entityId: created.id,
      recordReference: customer.companyName || customer.name,
      action: "CONTACT_RECORDED",
      actionNote,
      changeSummary: `Customer outreach recorded for ${customer.companyName || customer.name}`,
      newValue: {
        customerId,
        contactDate: created.contactDate,
        notes: created.notes
      }
    }, { transaction: tx });
    return created;
  });

  refreshApp();
  redirectWithMessage("/customer-outreach", "success", "Customer outreach recorded");
}

export async function createDeliveryNote(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CREATE_SURAT_JALAN")) {
    redirectWithMessage("/surat-jalan?mode=create", "error", "Only Admin and Manager roles can create Surat Jalan");
  }

  const pickingListIds = formData.getAll("pickingListId").map(value => typeof value === "string" ? value.trim() : "");
  if (!pickingListIds.length || pickingListIds.some(id => !id)) {
    redirectWithMessage("/surat-jalan?mode=create", "error", "Create and complete a Picking List before making Surat Jalan");
  }
  if (new Set(pickingListIds).size !== pickingListIds.length || pickingListIds.length > 100) {
    redirectWithMessage("/surat-jalan?mode=create", "error", "Select each Picking List once, up to 100 orders");
  }

  const explicitItemSelection = getString(formData, "itemSelectionMode") === "explicit";
  const requestedItemIds = formData.getAll("selectedItemId")
    .map(value => typeof value === "string" ? value.trim() : "");
  if (explicitItemSelection && (
    !requestedItemIds.length ||
    requestedItemIds.some(id => !id) ||
    new Set(requestedItemIds).size !== requestedItemIds.length ||
    requestedItemIds.length > 1000
  )) {
    redirectWithMessage("/surat-jalan?mode=create", "error", "Select at least one ready item, without duplicates");
  }

  const recipientName = getRequiredString(formData, "recipientName");
  const recipientPhone = getString(formData, "recipientPhone");
  const recipientAddress = getRequiredString(formData, "recipientAddress");
  const rawDeliveryDate = getRequiredString(formData, "deliveryDate");
  const deliveryDate = parseDateOnly(rawDeliveryDate);
  const deliveryAssignment = validateDeliveryAssignment({
    deliveryAssignmentId: formData.get("deliveryAssignmentId"),
    driverName: formData.get("driverName"),
    vehiclePlateNumber: formData.get("vehiclePlateNumber")
  });
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  const deliveryNote = await withDeliveryNoteNumberRetry(async () => prisma.$transaction(async tx => {
    // Share the item-edit/warehouse lock order, including combined shipments.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_orders
      WHERE id IN (SELECT sales_order_id FROM picking_lists WHERE id IN (${Prisma.join([...pickingListIds].sort())}))
      ORDER BY id FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM invoices
      WHERE sales_order_id IN (SELECT sales_order_id FROM picking_lists WHERE id IN (${Prisma.join([...pickingListIds].sort())}))
      ORDER BY sales_order_id, id FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM picking_lists WHERE id IN (${Prisma.join([...pickingListIds].sort())}) ORDER BY id FOR UPDATE`);
    const lists = await tx.pickingList.findMany({
      relationLoadStrategy: "join",
      where: { id: { in: pickingListIds } },
      orderBy: { id: "asc" },
      select: {
        id: true, status: true, usesChecklist: true, salesOrderId: true, pickerName: true, packerName: true,
        items: { select: {
          id: true, salesOrderItemId: true, itemName: true, orderedQuantity: true,
          availableQuantity: true, packedQuantity: true, availabilityStatus: true, notes: true, isChecked: true
        } },
        deliveryNote: { select: { id: true } },
        deliverySource: { select: { id: true } },
        salesOrder: { select: {
          customerId: true, orderNumber: true, customerPoNumber: true,
          deliveryDestinationSnapshot: true, status: true, approvalStatus: true,
          items: { select: { id: true, itemName: true, quantity: true } },
          deliverySources: { select: { id: true } },
          invoice: { select: {
            id: true, invoiceNumber: true, status: true, paymentTermType: true,
            deliveryNotes: { select: { id: true } },
            deliverySources: { select: { id: true } }
          } },
          deliveryNotes: { select: { id: true } }
        } }
      }
    });

    if (lists.length !== pickingListIds.length || lists.some(list => {
      const order = list.salesOrder;
      return list.status !== "Packed" || list.deliveryNote || list.deliverySource ||
        !canFulfillOrder(order) || !canCreateDeliveryFromSheet(list) || order.deliveryNotes.length > 0 ||
        order.deliverySources.length > 0 || (order.invoice?.deliveryNotes.length ?? 0) > 0 ||
        (order.invoice?.deliverySources.length ?? 0) > 0 ||
        order.items.length !== list.items.length ||
        list.items.some(item => !order.items.some(source =>
          source.id === item.salesOrderItemId && source.itemName === item.itemName && source.quantity === item.orderedQuantity));
    })) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Picking List is not ready or the source order has changed");
    }

    const first = lists[0];
    const destinationSnapshots = lists.map(list => list.salesOrder.deliveryDestinationSnapshot);
    if (
      lists.some(list => list.salesOrder.customerId !== first.salesOrder.customerId) ||
      !haveSameDeliveryDestination(destinationSnapshots)
    ) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "All selected orders must belong to the same customer and delivery destination");
    }
    const canonicalDestination = first.salesOrder.deliveryDestinationSnapshot.trim();
    if (normalizeDeliveryDestination(recipientAddress) !== normalizeDeliveryDestination(canonicalDestination)) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Recipient address must match the selected orders' delivery destination");
    }

    const allItems = lists.flatMap(list => list.items.map(item => ({
      ...item, packedQuantity: getPickingDeliveryQuantity(list, item),
    })));
    const selectedItemIds = explicitItemSelection
      ? new Set(requestedItemIds)
      : new Set(allItems.filter(item => item.packedQuantity > 0).map(item => item.id));
    if (
      !selectedItemIds.size ||
      [...selectedItemIds].some(id => {
        const item = allItems.find(candidate => candidate.id === id);
        return !item || item.packedQuantity <= 0;
      }) ||
      lists.some(list => !list.items.some(item => selectedItemIds.has(item.id)))
    ) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Selected items must be ready to ship and each selected order must contain an item to deliver");
    }

    const finalQuantityByItemId = new Map<string, number>();
    for (const item of allItems) {
      if (!selectedItemIds.has(item.id)) continue;
      const rawQuantity = explicitItemSelection
        ? getString(formData, "quantity_" + item.id)
        : String(item.packedQuantity);
      const quantity = Number(rawQuantity);
      if (!rawQuantity || !Number.isInteger(quantity) || quantity < 1 || quantity > item.packedQuantity) {
        redirectWithMessage("/surat-jalan?mode=create", "error", "Final delivery quantity must be between one and the ready-to-ship quantity");
      }
      finalQuantityByItemId.set(item.id, quantity);
    }
    if (!recipientName || !recipientAddress || !deliveryDate || !deliveryAssignment.valid) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Recipient, address, date, driver, and vehicle plate are required");
    }
    const deliveryNoteNumber = await allocateDocumentNumber("SJ", getJakartaDocumentYear(), tx);

    const note = await tx.deliveryNote.create({
      data: {
        deliveryNoteNumber,
        pickingListId: lists.length === 1 ? first.id : null,
        invoiceId: lists.length === 1 ? first.salesOrder.invoice!.id : null,
        salesOrderId: lists.length === 1 ? first.salesOrderId : null,
        customerId: first.salesOrder.customerId,
        recipientName, recipientPhone, recipientAddress: canonicalDestination, deliveryDate, status: "Draft",
        notes: getString(formData, "notes") || null,
        receiverName: getString(formData, "receiverName") || null,
        senderName: getString(formData, "senderName") || null,
        driverName: deliveryAssignment.value.driverName,
        vehiclePlateNumber: deliveryAssignment.value.vehiclePlateNumber,
        authorizedBy: getString(formData, "authorizedBy") || null,
        createdBy: currentUser.displayName || currentUser.username,
        orderReferencesSnapshot: encodeReferenceSnapshot(
          lists.map(list => orderReference(list.salesOrder)),
        ),
        invoiceReferencesSnapshot: encodeReferenceSnapshot(
          lists.map(list => list.salesOrder.invoice!.invoiceNumber),
        ),
        sources: { create: lists.map(list => ({
          pickingListId: list.id,
          salesOrderId: list.salesOrderId,
          invoiceId: list.salesOrder.invoice!.id
        })) }
      },
      include: { sources: true }
    });

    await tx.deliveryNoteItem.createMany({
      data: lists.flatMap(list => list.items.map(item => ({
        deliveryNoteId: note.id,
        sourceId: note.sources.find(source => source.pickingListId === list.id)!.id,
        pickingListItemId: item.id,
        itemName: item.itemName,
        orderedQuantitySnapshot: item.orderedQuantity,
        packedQuantitySnapshot: getPickingDeliveryQuantity(list, item),
        quantity: finalQuantityByItemId.get(item.id) ?? 0,
        outstandingQuantity: item.orderedQuantity - (finalQuantityByItemId.get(item.id) ?? 0),
        unit: "PCS"
      })))
    });

    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Surat Jalan",
      entityType: "DELIVERY_NOTE",
      entityId: note.id,
      recordReference: note.deliveryNoteNumber,
      action: "CREATED",
      actionNote,
      changeSummary: "Draft Surat Jalan " + note.deliveryNoteNumber + " created from " + pickingListIds.length + " Picking List(s)",
      newValue: {
        sources: note.sources,
        status: note.status,
        recipientName: note.recipientName,
        recipientAddress: note.recipientAddress,
        driverName: note.driverName,
        vehiclePlateNumber: note.vehiclePlateNumber
      }
    }, { transaction: tx });

    return note;
  }, { timeout: 20000 })).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirectWithMessage("/surat-jalan?mode=create", "error", "A selected Picking List already belongs to a Surat Jalan. Refresh and try again.");
    }
    throw error;
  });

  refreshApp();
  redirect("/surat-jalan?tab=open&view=" + deliveryNote.id + "&success=" + encodeURIComponent("Draft Surat Jalan created"));
}

export async function saveDeliveryNoteDraft(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CREATE_SURAT_JALAN")) {
    redirectWithMessage("/surat-jalan?tab=open", "error", "Only Admin and Manager can edit Surat Jalan");
  }

  const id = getRequiredString(formData, "id");
  const version = getRequiredString(formData, "version");
  const intent = getString(formData, "intent") === "issue" ? "issue" : "save";
  const recipientName = getRequiredString(formData, "recipientName");
  const recipientPhone = getString(formData, "recipientPhone");
  const recipientAddress = getRequiredString(formData, "recipientAddress");
  const rawDeliveryDate = getRequiredString(formData, "deliveryDate");
  const deliveryDate = parseDateOnly(rawDeliveryDate);
  const deliveryAssignment = validateDeliveryAssignment({
    deliveryAssignmentId: formData.get("deliveryAssignmentId"),
    driverName: formData.get("driverName"),
    vehiclePlateNumber: formData.get("vehiclePlateNumber")
  });
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !version || !recipientName || !recipientAddress || !deliveryDate || !deliveryAssignment.valid) {
    redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Recipient, address, date, driver, and vehicle plate are required");
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM delivery_notes WHERE id = ${id} FOR UPDATE`);
    const oldNote = await tx.deliveryNote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: "asc" } },
        salesOrder: { select: { deliveryDestinationSnapshot: true } },
        sources: {
          select: {
            salesOrderId: true,
            salesOrder: { select: { deliveryDestinationSnapshot: true } }
          }
        }
      }
    });

    if (!oldNote) throw new Error("DELIVERY_NOTE_NOT_FOUND");
    if (oldNote.status !== "Draft") throw new Error("DELIVERY_NOTE_LOCKED");
    if (oldNote.updatedAt.toISOString() !== version) throw new Error("DELIVERY_NOTE_CONFLICT");

    const hasCanonicalSource = oldNote.sources.length > 0 || Boolean(oldNote.salesOrder);
    const sourceDestinations = oldNote.sources.length > 0
      ? oldNote.sources.map(source => source.salesOrder.deliveryDestinationSnapshot)
      : oldNote.salesOrder
        ? [oldNote.salesOrder.deliveryDestinationSnapshot]
        : [];
    const canonicalRecipientAddress = hasCanonicalSource
      ? sourceDestinations[0]?.trim() ?? ""
      : oldNote.recipientAddress;
    if (
      (hasCanonicalSource && !haveSameDeliveryDestination(sourceDestinations)) ||
      normalizeDeliveryDestination(recipientAddress) !== normalizeDeliveryDestination(canonicalRecipientAddress)
    ) {
      throw new Error("DELIVERY_NOTE_DESTINATION_MISMATCH");
    }

    const items = oldNote.items.map(item => {
      const rawQuantity = getString(formData, "quantity_" + item.id);
      const quantity = Number(rawQuantity);
      if (!rawQuantity || !Number.isInteger(quantity) || quantity < 0 || quantity > item.packedQuantitySnapshot) {
        throw new Error("DELIVERY_NOTE_INVALID_QUANTITY");
      }
      return {
        id: item.id,
        quantity,
        outstandingQuantity: item.orderedQuantitySnapshot - quantity,
        adjustmentNote: getString(formData, "adjustmentNote_" + item.id) || null
      };
    });
    if (intent === "issue" && !items.some(item => item.quantity > 0)) {
      throw new Error("DELIVERY_NOTE_EMPTY");
    }

    const updateResult = await tx.deliveryNote.updateMany({
      where: { id, status: "Draft", updatedAt: oldNote.updatedAt },
      data: {
        recipientName, recipientPhone, recipientAddress: canonicalRecipientAddress, deliveryDate,
        notes: getString(formData, "notes") || null,
        receiverName: getString(formData, "receiverName") || null,
        senderName: getString(formData, "senderName") || null,
        driverName: deliveryAssignment.value.driverName,
        vehiclePlateNumber: deliveryAssignment.value.vehiclePlateNumber,
        authorizedBy: getString(formData, "authorizedBy") || null,
        status: intent === "issue" ? "Issued" : "Draft",
        issuedAt: intent === "issue" ? new Date() : null,
        issuedBy: intent === "issue" ? (currentUser.displayName || currentUser.username) : null
      }
    });
    if (updateResult.count !== 1) throw new Error("DELIVERY_NOTE_CONFLICT");

    const updatedItemCount = await tx.$executeRaw(Prisma.sql`
      UPDATE delivery_note_items AS target
      SET
        quantity = updates.quantity,
        outstanding_quantity = updates.outstanding_quantity,
        adjustment_note = updates.adjustment_note
      FROM (
        VALUES ${Prisma.join(items.map(item => Prisma.sql`(
          ${item.id}::text,
          ${id}::text,
          ${item.quantity}::integer,
          ${item.outstandingQuantity}::integer,
          ${item.adjustmentNote}::text
        )`))}
      ) AS updates(id, delivery_note_id, quantity, outstanding_quantity, adjustment_note)
      WHERE target.id = updates.id
        AND target.delivery_note_id = updates.delivery_note_id
    `);
    if (updatedItemCount !== items.length) throw new Error("DELIVERY_NOTE_CONFLICT");

    const deliveryNote = await tx.deliveryNote.findUniqueOrThrow({
      where: { id },
      include: {
        items: { orderBy: { id: "asc" } },
        sources: { select: { salesOrderId: true } }
      }
    });

    const issued = deliveryNote.status === "Issued";
    await createAuditTrailLog({
      actor: currentUser,
      moduleName: "Surat Jalan",
      entityType: "DELIVERY_NOTE",
      entityId: deliveryNote.id,
      recordReference: deliveryNote.deliveryNoteNumber,
      action: issued ? "ISSUED" : "DRAFT_UPDATED",
      actionNote,
      changeSummary: issued ? `Surat Jalan ${deliveryNote.deliveryNoteNumber} issued and locked` : `Draft Surat Jalan ${deliveryNote.deliveryNoteNumber} updated`,
      oldValue: {
        status: oldNote.status,
        recipientName: oldNote.recipientName,
        recipientAddress: oldNote.recipientAddress,
        items: oldNote.items.map(item => ({ id: item.id, quantity: item.quantity, outstandingQuantity: item.outstandingQuantity, adjustmentNote: item.adjustmentNote }))
      },
      newValue: {
        status: deliveryNote.status,
        issuedAt: deliveryNote.issuedAt,
        issuedBy: deliveryNote.issuedBy,
        recipientName: deliveryNote.recipientName,
        recipientAddress: deliveryNote.recipientAddress,
        items: deliveryNote.items.map(item => ({
          id: item.id,
          orderedQuantity: item.orderedQuantitySnapshot,
          packedQuantity: item.packedQuantitySnapshot,
          quantity: item.quantity,
          outstandingQuantity: item.outstandingQuantity,
          adjustmentNote: item.adjustmentNote
        }))
      }
    }, { transaction: tx });

    return { oldNote, deliveryNote };
  }, { timeout: 20000 }).catch((error: unknown) => {
    if (error instanceof Error) {
      if (error.message === "DELIVERY_NOTE_NOT_FOUND") redirectWithMessage("/surat-jalan", "error", "Surat Jalan was not found");
      if (error.message === "DELIVERY_NOTE_LOCKED") redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Issued Surat Jalan is locked and can no longer be edited");
      if (error.message === "DELIVERY_NOTE_CONFLICT") redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Surat Jalan changed. Refresh and review the latest draft.");
      if (error.message === "DELIVERY_NOTE_INVALID_QUANTITY") redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Each delivery quantity must be between zero and its packed quantity");
      if (error.message === "DELIVERY_NOTE_EMPTY") redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "At least one item must have a delivery quantity before Issue");
      if (error.message === "DELIVERY_NOTE_DESTINATION_MISMATCH") redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Recipient address must match the source orders' delivery destination");
    }
    throw error;
  });

  const issued = result.deliveryNote.status === "Issued";
  refreshApp();
  redirect(`/surat-jalan?tab=open&view=${id}&success=${encodeURIComponent(issued ? "Surat Jalan issued and locked" : "Draft Surat Jalan saved")}`);
}

export async function updateDeliveryNoteStatus(formData: FormData) {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CREATE_SURAT_JALAN")) {
    redirectWithMessage("/surat-jalan?tab=open", "error", "Only Admin and Manager can update Surat Jalan");
  }
  const id = getRequiredString(formData, "id");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const requestedStatus = getRequiredString(formData, "status");
  if (!["Delivered", "Cancelled"].includes(requestedStatus)) {
    redirectWithMessage("/surat-jalan?tab=open", "error", "Invalid Surat Jalan status transition");
  }
  const status = requestedStatus as DeliveryNoteStatus;
  if (!id) redirectWithMessage("/surat-jalan", "error", "Surat Jalan ID is required");
  const receiverName = status === "Delivered" ? getRequiredString(formData, "receiverName") : "";
  const receiptNotes = status === "Delivered" ? getString(formData, "receiptNotes") : "";
  const receivedAt = status === "Delivered"
    ? parseJakartaDateTimeInput(getRequiredString(formData, "receivedAt"))
    : null;

  if (
    status === "Delivered" &&
    (!receiverName || receiverName.length > 200 || !receivedAt || receiptNotes.length > 2000)
  ) {
    redirectWithMessage(
      "/surat-jalan?tab=open&view=" + id,
      "error",
      "Receiver name and a valid received date/time are required"
    );
  }

  const oldDeliveryNote = await prisma.deliveryNote.findUnique({
    where: { id },
    select: {
      id: true,
      deliveryNoteNumber: true,
      status: true,
      notes: true,
      issuedAt: true,
      receiverName: true,
      receivedAt: true,
      receivedBy: true,
      receiptNotes: true
    }
  });
  if (!oldDeliveryNote) redirectWithMessage("/surat-jalan", "error", "Surat Jalan was not found");

  const allowedNextStatus = oldDeliveryNote.status === "Draft"
    ? ["Cancelled"]
    : oldDeliveryNote.status === "Issued" ? ["Delivered", "Cancelled"] : [];
  if (!allowedNextStatus.includes(status)) {
    redirectWithMessage("/surat-jalan?tab=open", "error", "Invalid Surat Jalan status transition");
  }
  if (
    status === "Delivered" &&
    receivedAt &&
    (receivedAt.getTime() > Date.now() + 5 * 60 * 1000 ||
      (oldDeliveryNote.issuedAt && receivedAt < oldDeliveryNote.issuedAt))
  ) {
    redirectWithMessage(
      "/surat-jalan?tab=open&view=" + id,
      "error",
      "Received time must be after the Surat Jalan was sent and cannot be in the future"
    );
  }

  await prisma.$transaction(async tx => {
    const updateResult = await tx.deliveryNote.updateMany({
      where: { id, status: oldDeliveryNote.status },
      data: {
        status,
        notes: status === "Cancelled"
          ? mergeActionNotes(oldDeliveryNote.notes, actionNote)
          : oldDeliveryNote.notes,
        receiverName: status === "Delivered" ? receiverName : oldDeliveryNote.receiverName,
        receivedAt: status === "Delivered" ? receivedAt : oldDeliveryNote.receivedAt,
        receivedBy: status === "Delivered"
          ? currentUser.displayName || currentUser.username
          : oldDeliveryNote.receivedBy,
        receiptNotes: status === "Delivered"
          ? receiptNotes || null
          : oldDeliveryNote.receiptNotes
      }
    });
    if (updateResult.count !== 1) throw new Error("DELIVERY_NOTE_CONFLICT");
    const deliveryNote = await tx.deliveryNote.findUniqueOrThrow({
      where: { id },
      include: { sources: { select: { salesOrderId: true } } }
    });
    const orderIds = [...new Set([
      deliveryNote.salesOrderId,
      ...(deliveryNote.sources ?? []).map(source => source.salesOrderId)
    ])].filter((orderId): orderId is string => Boolean(orderId));
    const completedInquiries = status === "Delivered"
      ? await completeCustomerInquiriesForDeliveredOrders(tx, orderIds)
      : [];

    await createAuditTrailLog([
      {
        actor: currentUser,
        moduleName: "Surat Jalan",
        entityType: "DELIVERY_NOTE",
        entityId: deliveryNote.id,
        recordReference: deliveryNote.deliveryNoteNumber,
        action: deliveryNote.status === "Delivered" ? "DELIVERED" : "STATUS_CHANGED",
        actionNote: status === "Delivered" ? receiptNotes : actionNote,
        changeSummary: `Surat Jalan status changed from ${oldDeliveryNote.status} to ${deliveryNote.status}`,
        oldValue: { status: oldDeliveryNote.status },
        newValue: {
          status: deliveryNote.status,
          receiverName: deliveryNote.receiverName,
          receivedAt: deliveryNote.receivedAt,
          receivedBy: deliveryNote.receivedBy,
          receiptNotes: deliveryNote.receiptNotes
        }
      },
      ...completedInquiries.map(inquiry => ({
        actor: currentUser,
        moduleName: "Customer Inquiry",
        entityType: "CUSTOMER_INQUIRY",
        entityId: inquiry.id,
        recordReference: inquiry.inquiryNumber,
        action: "COMPLETED",
        changeSummary: "Customer inquiry completed after linked order delivery",
        newValue: { status: "Done", salesOrderId: inquiry.salesOrderId }
      }))
    ], { transaction: tx });

    return deliveryNote;
  }, { timeout: 20000 }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "DELIVERY_NOTE_CONFLICT") {
      redirectWithMessage("/surat-jalan?tab=open", "error", "Surat Jalan changed. Refresh and review its current status.");
    }
    if (error instanceof Error && error.message === "CUSTOMER_INQUIRY_CONFLICT") {
      redirectWithMessage("/surat-jalan?tab=open", "error", "A linked Customer Inquiry changed. Refresh and try again.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      redirectWithMessage("/surat-jalan?tab=open", "error", "Surat Jalan changed. Refresh and review its current status.");
    }
    throw error;
  });

  refreshApp();
  redirect(`/surat-jalan?tab=${status === "Delivered" || status === "Cancelled" ? "completed" : "open"}&view=${id}&success=${encodeURIComponent(status === "Delivered" ? "Surat Jalan marked as received" : "Surat Jalan cancelled")}`);
}

function summarizeCustomer(customer: {
  name: string;
  companyName: string;
  npwp?: string | null;
  phone: string;
  email: string;
  address: string;
  customerSegment: string;
  status: string;
  notes?: string | null;
}) {
  return {
    name: customer.name,
    companyName: customer.companyName,
    npwp: customer.npwp,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    customerSegment: customer.customerSegment,
    status: customer.status,
    notes: customer.notes
  };
}

function summarizeProduct(product: {
  productName: string;
  sku?: string | null;
  notes?: string | null;
  listPrice: number;
  status: string;
}) {
  return {
    productName: product.productName,
    sku: product.sku ?? null,
    notes: product.notes,
    listPrice: product.listPrice,
    status: product.status
  };
}

function summarizeOrderPricing(
  items: Array<{
    productId: string;
    itemName: string;
    quantity: number;
    baseUnitPrice: number;
    markupPercent: number;
    discountPercent: number;
    finalUnitPrice: number;
  }>
) {
  return items.map((item) => ({
    productId: item.productId,
    productName: item.itemName,
    quantity: item.quantity,
    baseUnitPrice: item.baseUnitPrice,
    markupPercent: item.markupPercent,
    discountPercent: item.discountPercent,
    adjustedUnitPrice: item.finalUnitPrice,
    subtotal: item.quantity * item.finalUnitPrice
  }));
}

function summarizeInvoice(invoice: {
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  paymentTermType: string;
  creditTermMonths?: number | null;
  creditTermWeeks?: number | null;
  notes?: string | null;
  customerNpwpSnapshot?: string | null;
  ppnApplied?: boolean;
  ppnRateBasisPoints?: number;
  ppnAmount?: number;
  netSalesAmount?: number;
}) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    remainingAmount: invoice.remainingAmount,
    status: invoice.status,
    paymentTermType: invoice.paymentTermType,
    creditTermMonths: invoice.creditTermMonths,
    creditTermWeeks: invoice.creditTermWeeks,
    notes: invoice.notes,
    customerNpwpSnapshot: invoice.customerNpwpSnapshot,
    ppnApplied: invoice.ppnApplied,
    ppnRateBasisPoints: invoice.ppnRateBasisPoints,
    ppnAmount: invoice.ppnAmount,
    netSalesAmount: invoice.netSalesAmount
  };
}

function summarizeTaxSnapshot(record: {
  customerNpwpSnapshot: string | null;
  ppnApplied: boolean;
  ppnRateBasisPoints: number;
  ppnAmount: number;
  netSalesAmount: number;
}) {
  return {
    customerNpwpSnapshot: record.customerNpwpSnapshot,
    ppnApplied: record.ppnApplied,
    ppnRateBasisPoints: record.ppnRateBasisPoints,
    ppnAmount: record.ppnAmount,
    netSalesAmount: record.netSalesAmount
  };
}

function summarizeCollectionTask(collectionTask: {
  scheduledDate: Date;
  status: string;
  notes: string;
  version?: number;
}) {
  return {
    scheduledDate: collectionTask.scheduledDate.toISOString().slice(0, 10),
    status: collectionTask.status,
    notes: collectionTask.notes,
    ...(collectionTask.version === undefined ? {} : { version: collectionTask.version })
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

async function withDeliveryNoteNumberRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      if (String(JSON.stringify(error.meta?.target)).includes("picking_list_id")) {
        redirectWithMessage("/surat-jalan?tab=open", "error", "Surat Jalan already exists for this Picking List");
      }
      if (!String(JSON.stringify(error.meta?.target)).includes("delivery_note_number") || attempt === 2) throw error;
    }
  }
  throw new Error("Unable to allocate a Surat Jalan number");
}

async function allocateAvailableCustomerPoNumber(year: number) {
  // A customer-entered reference may already use the automatic number format.
  while (true) {
    const number = await allocateDocumentNumber("PO", year);
    const existing = await prisma.salesOrder.findUnique({
      where: { customerPoNumber: number },
      select: { id: true }
    });
    if (!existing) return number;
  }
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function isUniqueFieldCollision(error: unknown, fieldName: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some((field) => field === fieldName);
  }

  return typeof target === "string" && target.includes(fieldName);
}

function getRequiredString(formData: FormData, name: string) {
  return getString(formData, name);
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function parseProductPrice(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "").trim();
  const parsed = Number(rawValue);

  if (!rawValue || !Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_ORDER_UNIT_PRICE) {
    return null;
  }

  return parsed;
}

function parseProductSku(value: FormDataEntryValue | null) {
  const sku = String(value ?? "").trim().toUpperCase();
  if (!sku) return null;
  if (sku.length > 64 || !/^[A-Z0-9][A-Z0-9._-]*$/.test(sku)) {
    redirectWithMessage("/products", "error", "SKU may contain only letters, numbers, dot, underscore, and dash");
  }
  return sku;
}

function parseRupiahAmount(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) ? amount : null;
}

function getStatus<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T
) {
  const value = getString(formData, name) as T;
  return allowed.includes(value) ? value : fallback;
}

function refreshApp() {
  for (const path of pathsToRefresh) {
    revalidatePath(path);
  }
}

function redirectWithMessage(path: string, kind: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}
