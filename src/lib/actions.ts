"use server";

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import type {
  Customer,
  CustomerStatus,
  CustomerInquiryStatus,
  DeliveryNoteStatus,
  CollectionTaskStatus,
  PaymentMethod,
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
  canCreateDeliveryFromPickingList,
  canFulfillOrder,
} from "@/lib/picking-list";
import { parseOptionalNpwp } from "@/lib/npwp";
import { canRole } from "@/lib/role-access";
import {
  canGenerateInvoiceForApproval,
  requiresApprovalDecisionNote,
  requiresManagerApproval
} from "@/lib/sales-order-approval";
import { requireCurrentUser } from "@/lib/session";
import { buildOrderTaxSnapshot } from "@/lib/tax";
import {
  canDeleteOngoingSalesOrder,
  deleteSalesOrderProcess
} from "@/lib/sales-order-deletion";
import { mergeActionNotes, normalizeActionNote } from "@/lib/action-notes";
import { parseOptionalInquiryPrice } from "@/lib/customer-inquiry";
import { completeCustomerInquiriesForDeliveredOrders } from "@/lib/customer-inquiry-lifecycle";
import { parseJakartaDateTimeInput } from "@/lib/delivery-note-status";
import { nextNumberFromExisting } from "@/lib/document-numbering";
import { validateDeliveryAssignment } from "@/lib/delivery-options";
import {
  PaymentRecordingError,
  recordInvoicePayment
} from "@/lib/payment-recording";
import {
  deleteCustomerPoDocument,
  CUSTOMER_PO_DOCUMENT_MAX_BYTES,
  CUSTOMER_PO_DOCUMENT_TYPES,
  uploadCustomerPoDocument
} from "@/lib/customer-po-storage";
import {
  calculateOrderTotals,
  getDueDateForPaymentTerm,
  nextDocumentNumber,
  normalizePaymentTerm,
  normalizeOrderItems,
  parseAmount
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

export async function createCustomer(formData: FormData) {
  await requireCurrentUser();
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
  let customer: Customer;
  try {
    customer = await prisma.customer.create({
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

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    recordReference: customer.companyName || customer.name,
    action: "CREATED",
    actionNote,
    changeSummary: `Customer ${customer.companyName || customer.name} created`,
    newValue: summarizeCustomer(customer)
  });

  refreshApp();
  redirectWithMessage("/customers", "success", "Customer added");
}

export async function updateCustomer(formData: FormData) {
  await requireCurrentUser();
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

  const oldCustomer = await prisma.customer.findUnique({ where: { id } });

  if (!oldCustomer) {
    redirectWithMessage("/customers", "error", "Customer was not found");
  }

  const status = getStatus<CustomerStatus>(formData, "status", ["Active", "Inactive"], "Active");
  let customer: Customer;
  try {
    customer = await prisma.customer.update({
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

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    recordReference: customer.companyName || customer.name,
    action: oldCustomer.status !== customer.status ? "STATUS_CHANGED" : "UPDATED",
    actionNote,
    changeSummary:
      oldCustomer.status !== customer.status
        ? `Customer status changed from ${oldCustomer.status} to ${customer.status}`
        : `Customer ${customer.companyName || customer.name} updated`,
    oldValue: summarizeCustomer(oldCustomer),
    newValue: summarizeCustomer(customer)
  });

  refreshApp();
  redirect(`/customers?view=${id}&success=${encodeURIComponent("Customer updated")}`);
}

export async function updateCustomerStatus(formData: FormData) {
  await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const requestedStatus = getString(formData, "status");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !["Active", "Inactive"].includes(requestedStatus)) {
    redirectWithMessage("/customers", "error", "Customer and a valid status are required");
  }

  const oldCustomer = await prisma.customer.findUnique({ where: { id } });

  if (!oldCustomer) {
    redirectWithMessage("/customers", "error", "Customer was not found");
  }

  const status = requestedStatus as CustomerStatus;
  const customer = await prisma.customer.update({
    where: { id },
    data: { status, notes: mergeActionNotes(oldCustomer.notes, actionNote) }
  });

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    recordReference: customer.companyName || customer.name,
    action: "STATUS_CHANGED",
    actionNote,
    changeSummary: `Customer status changed from ${oldCustomer.status} to ${customer.status}`,
    oldValue: { status: oldCustomer.status },
    newValue: { status: customer.status }
  });

  refreshApp();
  redirect(
    `/customers?view=${id}&success=${encodeURIComponent(
      `Customer marked as ${customer.status.toLowerCase()}`
    )}`
  );
}

export async function createProduct(formData: FormData) {
  await requireCurrentUser();
  const productName = getRequiredString(formData, "productName");
  const listPrice = parseProductPrice(formData.get("listPrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!productName) {
    redirectWithMessage("/products", "error", "Product name is required");
  }

  if (listPrice === null) {
    redirectWithMessage("/products", "error", "List Price must be a valid non-negative amount");
  }

  const status = getStatus<ProductStatus>(formData, "status", ["Active", "Inactive"], "Active");
  const product = await prisma.product.create({
    data: {
      productName,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote),
      listPrice,
      status
    }
  });

  await createAuditTrailLog({
    moduleName: "Products",
    entityType: "PRODUCT",
    entityId: product.id,
    recordReference: product.productName,
    action: "CREATED",
    actionNote,
    changeSummary: `Product ${product.productName} created`,
    newValue: summarizeProduct(product)
  });

  refreshApp();
  redirectWithMessage("/products", "success", "Product added");
}

export async function updateProduct(formData: FormData) {
  await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const productName = getRequiredString(formData, "productName");
  const listPrice = parseProductPrice(formData.get("listPrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !productName) {
    redirectWithMessage("/products", "error", "Product ID and product name are required");
  }

  if (listPrice === null) {
    redirectWithMessage("/products", "error", "List Price must be a valid non-negative amount");
  }

  const oldProduct = await prisma.product.findUnique({ where: { id } });

  if (!oldProduct) {
    redirectWithMessage("/products", "error", "Product was not found");
  }

  const status = getStatus<ProductStatus>(formData, "status", ["Active", "Inactive"], "Active");
  const product = await prisma.product.update({
    where: { id },
    data: {
      productName,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote),
      listPrice,
      status
    }
  });

  await createAuditTrailLog({
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
  });

  refreshApp();
  redirect(`/products?view=${id}&success=${encodeURIComponent("Product updated")}`);
}

export async function updateProductStatus(formData: FormData) {
  await requireCurrentUser();
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
  const product = await prisma.product.update({
    where: { id },
    data: { status, notes: mergeActionNotes(oldProduct.notes, actionNote) }
  });

  await createAuditTrailLog({
    moduleName: "Products",
    entityType: "PRODUCT",
    entityId: product.id,
    recordReference: product.productName,
    action: "STATUS_CHANGED",
    actionNote,
    changeSummary: `Product status changed from ${oldProduct.status} to ${product.status}`,
    oldValue: { status: oldProduct.status },
    newValue: { status: product.status }
  });

  refreshApp();
  redirect(
    `/products?view=${id}&success=${encodeURIComponent(
      `Product marked as ${product.status.toLowerCase()}`
    )}`
  );
}

export async function createCustomerInquiry(formData: FormData) {
  await requireCurrentUser();
  const customerId = getRequiredString(formData, "customerId");
  const notes = getString(formData, "notes");
  const neededBy = parseDateInput(getString(formData, "neededBy"));
  const rawItems = safeJsonParse(getString(formData, "items"));
  const items = Array.isArray(rawItems)
    ? rawItems.map((item) => ({
        productId: typeof item?.productId === "string" && item.productId ? item.productId : null,
        itemName: typeof item?.itemName === "string" ? item.itemName.trim() : "",
        quantity: Number(item?.quantity),
        requestedUnitPrice: parseOptionalInquiryPrice(item?.requestedUnitPrice),
        agreedUnitPrice: parseOptionalInquiryPrice(item?.agreedUnitPrice),
        notes: typeof item?.notes === "string" && item.notes.trim() ? item.notes.trim() : null
      }))
    : [];

  if (!customerId || !items.length || items.some((item) => !item.itemName || !Number.isInteger(item.quantity) || item.quantity < 1)) {
    redirectWithMessage("/customer-inquiries", "error", "Select a customer and add at least one valid item");
  }
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) redirectWithMessage("/customer-inquiries", "error", "Customer was not found");
  const inquiryNumber = `INQ-${new Date().getFullYear()}-${String((await prisma.customerInquiry.count()) + 1).padStart(3, "0")}`;
  const inquiry = await prisma.customerInquiry.create({ data: { inquiryNumber, customerId, neededBy, notes: notes || null, items: { create: items } } });
  await createAuditTrailLog({ moduleName: "Customer Inquiry", entityType: "CUSTOMER_INQUIRY", entityId: inquiry.id, recordReference: inquiry.inquiryNumber, action: "CREATED", changeSummary: `Customer inquiry ${inquiry.inquiryNumber} created for ${customer.companyName}`, newValue: { status: inquiry.status, itemCount: items.length } });
  refreshApp();
  redirectWithMessage(`/customer-inquiries/${inquiry.id}`, "success", "Customer inquiry created");
}

export async function updateCustomerInquiryStatus(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const inquiryId = getRequiredString(formData, "inquiryId");
  const status = getStatus<CustomerInquiryStatus>(formData, "status", ["Closed", "Cancelled"], "Closed");
  const statusNote = getRequiredString(formData, "statusNote");
  if (!inquiryId || !statusNote) redirectWithMessage("/customer-inquiries", "error", "A status reason is required");
  const inquiry = await prisma.customerInquiry.findUnique({ where: { id: inquiryId } });
  if (!inquiry || inquiry.status !== "Open") redirectWithMessage("/customer-inquiries", "error", "Only open inquiries can be updated");
  await prisma.customerInquiry.update({ where: { id: inquiryId }, data: { status, statusNote } });
  await createAuditTrailLog({ moduleName: "Customer Inquiry", entityType: "CUSTOMER_INQUIRY", entityId: inquiryId, recordReference: inquiry.inquiryNumber, action: status === "Cancelled" ? "CANCELLED" : "CLOSED", changeSummary: `Customer inquiry ${inquiry.inquiryNumber} marked ${status.toLowerCase()} by ${currentUser.displayName}`, newValue: { status, statusNote } });
  refreshApp();
  redirectWithMessage(`/customer-inquiries/${inquiryId}`, "success", `Inquiry marked ${status.toLowerCase()}`);
}

export async function createSalesOrder(formData: FormData) {
  const source = getStatus<SalesOrderSource>(
    formData,
    "source",
    ["DIRECT", "CUSTOMER_PO"],
    "DIRECT"
  );
  const isCustomerPo = source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const moduleName = isCustomerPo ? "Customer Purchase Orders" : "Sales Orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";
  const customerId = getRequiredString(formData, "customerId");
  const inquiryId = getString(formData, "inquiryId");
  const rawItems = getString(formData, "items");
  const notes = getString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const submittedItems = normalizeOrderItems(safeJsonParse(rawItems));
  const rawPaymentTermType = getString(formData, "paymentTermType");
  const rawCreditTermMonths = formData.get("creditTermMonths");
  const { paymentTermType, creditTermMonths, creditTermWeeks } = normalizePaymentTerm({
    paymentTermType: rawPaymentTermType,
    creditTermMonths: rawCreditTermMonths,
    creditTerm: formData.get("creditTerm")
  });

  if (!customerId || submittedItems.length === 0) {
    redirectWithMessage(
      basePath,
      "error",
      "Select a customer and add at least one item"
    );
  }

  if (
    !isValidSalesOrderPaymentTerm({
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
  if (!canRole(currentUser?.role, "CREATE_SALES_ORDER")) {
    redirectWithMessage(
      basePath,
      "error",
      "Only Sales and Manager roles can create Sales Orders"
    );
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
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
  if (inquiryId) {
    const inquiry = await prisma.customerInquiry.findUnique({ where: { id: inquiryId }, include: { items: true } });
    if (!inquiry || inquiry.customerId !== customerId || inquiry.status !== "Open") {
      redirectWithMessage(basePath, "error", "Customer Inquiry is not available for conversion");
    }
  }

  const productIds = [...new Set(submittedItems.map((item) => item.productId))];
  const activeProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "Active" },
    select: { id: true, productName: true }
  });

  if (activeProducts.length !== productIds.length) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Every item must use an active Product from the Product menu"
    );
  }

  const productNames = new Map(
    activeProducts.map((product) => [product.id, product.productName])
  );
  const items = submittedItems.map((item) => ({
    ...item,
    itemName: productNames.get(item.productId) ?? item.itemName
  }));
  const totals = calculateOrderTotals(items);
  const taxSnapshot = buildOrderTaxSnapshot({
    totalAmount: totals.total,
    customerNpwp: customer.npwp
  });
  const requiredDate = isCustomerPo
    ? parseDateInput(getString(formData, "requiredDate"))
    : null;
  const customerPoDocument = isCustomerPo ? getCustomerPoDocument(formData) : null;

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
      "Upload the customer PO document as PDF, JPG, PNG, DOC, or DOCX"
    );
  }

  const storedDocument = customerPoDocument ? await storeCustomerPoDocument(customerPoDocument) : null;
  const buildOrderSourceData = (customerPoNumber: string | null) => ({
    source,
    customerPoNumber,
    requiredDate,
    customerPoDocumentName: storedDocument?.originalName ?? null,
    customerPoDocumentStoredName: storedDocument?.storedName ?? null,
    customerPoDocumentMimeType: storedDocument?.mimeType ?? null
  });
  const paymentSummary = getCustomerPaymentSummary(customer);
  const needsApproval = requiresManagerApproval(currentUser?.role ?? "", paymentSummary.paymentStatus);

  if (needsApproval) {
    const salesOrder = await withDocumentNumberRetry(
      async ({ orderNumber, customerPoNumber }) =>
        prisma.salesOrder.create({
          data: {
            orderNumber,
            ...buildOrderSourceData(customerPoNumber),
            customerId,
            orderDate: new Date(),
            status: "Draft",
            subtotal: totals.subtotal,
            total: totals.total,
            ...taxSnapshot,
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            notes: mergeActionNotes(notes, actionNote),
            approvalStatus: "Pending",
            approvalRisk: paymentSummary.paymentStatus,
            createdByUserId: currentUser?.id ?? null,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                itemName: item.itemName,
                quantity: item.quantity,
                baseUnitPrice: item.baseUnitPrice,
                markupPercent: item.markupPercent,
                discountPercent: item.discountPercent,
                finalUnitPrice: item.finalUnitPrice,
                subtotal: item.quantity * item.finalUnitPrice
              }))
            }
          }
        }),
      { includeCustomerPo: isCustomerPo }
    );
    await linkCustomerInquiry(inquiryId, salesOrder.id, isCustomerPo);

    await createAuditTrailLog({
      moduleName,
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      recordReference: salesOrder.orderNumber,
      action: "APPROVAL_REQUESTED",
      actionNote,
      changeSummary: `${orderLabel} ${salesOrder.orderNumber} requires Manager approval because the customer has outstanding payments`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        customerPoNumber: salesOrder.customerPoNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        paymentStatus: paymentSummary.paymentStatus,
        outstandingAmount: paymentSummary.outstandingAmount,
        openInvoiceCount: paymentSummary.openInvoiceCount,
        total: salesOrder.total,
        taxSnapshot: summarizeTaxSnapshot(salesOrder),
        items: summarizeOrderPricing(items)
      }
    });

    refreshApp();
    redirectWithMessage(
      `${basePath}?tab=approval`,
      "success",
      `${orderLabel} submitted for Manager approval`
    );
  }

  if (currentUser?.role === "SALES") {
    const salesOrder = await withDocumentNumberRetry(
      async ({ orderNumber, customerPoNumber }) =>
        prisma.salesOrder.create({
          data: {
            orderNumber,
            ...buildOrderSourceData(customerPoNumber),
            customerId,
            orderDate: new Date(),
            status: "Confirmed",
            subtotal: totals.subtotal,
            total: totals.total,
            ...taxSnapshot,
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            notes: mergeActionNotes(notes, actionNote),
            approvalStatus: "NotRequired",
            createdByUserId: currentUser.id,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                itemName: item.itemName,
                quantity: item.quantity,
                baseUnitPrice: item.baseUnitPrice,
                markupPercent: item.markupPercent,
                discountPercent: item.discountPercent,
                finalUnitPrice: item.finalUnitPrice,
                subtotal: item.quantity * item.finalUnitPrice
              }))
            }
          }
        }),
      { includeCustomerPo: isCustomerPo }
    );
    await linkCustomerInquiry(inquiryId, salesOrder.id, isCustomerPo);

    await createAuditTrailLog({
      moduleName,
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      recordReference: salesOrder.orderNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `${orderLabel} ${salesOrder.orderNumber} created and is ready for Admin or Manager invoicing`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        customerPoNumber: salesOrder.customerPoNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        total: salesOrder.total,
        taxSnapshot: summarizeTaxSnapshot(salesOrder),
        paymentTermType: salesOrder.paymentTermType,
        items: summarizeOrderPricing(items)
      }
    });

    refreshApp();
    redirectWithMessage(
      `${basePath}?view=${salesOrder.id}`,
      "success",
      `${orderLabel} created. Admin or Manager can generate the invoice`
    );
  }

  const issueDate = new Date();
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths,
    creditTermWeeks
  });

  const result = await withDocumentNumberRetry(
    ({ orderNumber, customerPoNumber, invoiceNumber }) =>
      prisma.$transaction(async (tx) => {
        const salesOrder = await tx.salesOrder.create({
          data: {
            orderNumber,
            ...buildOrderSourceData(customerPoNumber),
            customerId,
            orderDate: issueDate,
            status: "Invoiced",
            subtotal: totals.subtotal,
            total: totals.total,
            ...taxSnapshot,
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            notes: mergeActionNotes(notes, actionNote),
            approvalStatus: "NotRequired",
            createdByUserId: currentUser?.id ?? null,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                itemName: item.itemName,
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

        const createdInvoice = await tx.invoice.create({
          data: {
            invoiceNumber: invoiceNumber as string,
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
            paymentTermType,
            creditTermMonths,
            creditTermWeeks,
            status: "Unpaid",
            notes: actionNote || null
          }
        });

        const collectionTask =
          paymentTermType === "CREDIT"
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

        return { salesOrder, invoice: createdInvoice, collectionTask };
      }),
    { includeCustomerPo: isCustomerPo, includeInvoice: true }
  );

  await linkCustomerInquiry(inquiryId, result.salesOrder.id, isCustomerPo);

  await createAuditTrailLog({
    moduleName,
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    recordReference: result.salesOrder.orderNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `${orderLabel} ${result.salesOrder.orderNumber} created and invoiced`,
    newValue: {
      orderNumber: result.salesOrder.orderNumber,
      customerPoNumber: result.salesOrder.customerPoNumber,
      status: result.salesOrder.status,
      total: result.salesOrder.total,
      taxSnapshot: summarizeTaxSnapshot(result.salesOrder),
      paymentTermType: result.salesOrder.paymentTermType,
      creditTermMonths: result.salesOrder.creditTermMonths,
      creditTermWeeks: result.salesOrder.creditTermWeeks,
      items: summarizeOrderPricing(items)
    }
  });
  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from sales order ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.collectionTask) {
    await createAuditTrailLog({
      moduleName: "Collections",
      entityType: "COLLECTION_TASK",
      entityId: result.collectionTask.id,
      recordReference: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit payment collection task created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeCollectionTask(result.collectionTask)
    });
  }

  refreshApp();
  redirect(
    `/invoices?view=${result.invoice.id}&success=${encodeURIComponent(
      `${orderLabel} confirmed and invoice generated`
    )}`
  );
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
      "Orders with Picking Lists, completed deliveries, paid invoices, or cancellations cannot be deleted"
    );
  }

  const invoiceId = salesOrder.invoice?.id;
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
    await deleteSalesOrderProcess(tx, {
      salesOrderId: salesOrder.id,
      invoiceId
    });
  });

  if (salesOrder.customerPoDocumentStoredName) {
    await deleteCustomerPoDocument(salesOrder.customerPoDocumentStoredName).catch(() => undefined);
  }

  await createAuditTrailLog({
    moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: salesOrder.id,
    recordReference: salesOrder.orderNumber,
    action: "DELETED",
    actionNote,
    changeSummary: `Ongoing ${orderLabel.toLowerCase()} ${salesOrder.orderNumber} and its related process records were deleted`,
    oldValue: deletedSummary
  });

  refreshApp();
  redirectWithMessage(
    basePath,
    "success",
    `${orderLabel} ${salesOrder.orderNumber} and its related records were deleted`
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

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { invoice: true }
  });

  if (!salesOrder) {
    redirectWithMessage("/sales-orders", "error", "Sales order was not found");
  }

  const isCustomerPo = salesOrder.source === "CUSTOMER_PO";
  const basePath = isCustomerPo ? "/customer-purchase-orders" : "/sales-orders";
  const orderLabel = isCustomerPo ? "Customer PO" : "Sales order";

  if (salesOrder.invoice) {
    redirectWithMessage(
      basePath,
      "error",
      "This sales order already has an invoice"
    );
  }

  if (!canGenerateInvoiceForApproval(salesOrder.approvalStatus)) {
    redirectWithMessage(
      `${basePath}?tab=approval`,
      "error",
      salesOrder.approvalStatus === "Pending"
        ? "Manager approval is required before an invoice can be generated"
        : "A rejected sales order cannot generate an invoice"
    );
  }

  const issueDate = new Date();
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType: salesOrder.paymentTermType,
    creditTermMonths: salesOrder.creditTermMonths,
    creditTermWeeks: salesOrder.creditTermWeeks
  });
  const invoiceNumber = await nextDocumentNumber("INV");

  const result = await prisma.$transaction(async (tx) => {
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
        paymentTermType: salesOrder.paymentTermType,
        creditTermMonths: salesOrder.creditTermMonths,
        creditTermWeeks: salesOrder.creditTermWeeks,
        status: "Unpaid",
        notes: actionNote || null
      }
    });

    const updatedSalesOrder = await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        status: "Invoiced",
        notes: mergeActionNotes(salesOrder.notes, actionNote)
      }
    });

    const collectionTask =
      salesOrder.paymentTermType === "CREDIT"
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

    return { invoice: createdInvoice, salesOrder: updatedSalesOrder, collectionTask };
  });

  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from ${orderLabel.toLowerCase()} ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    recordReference: result.salesOrder.orderNumber,
    action: "STATUS_CHANGED",
    actionNote,
    changeSummary: `${orderLabel} status changed to ${result.salesOrder.status}`,
    oldValue: { status: salesOrder.status },
    newValue: { status: result.salesOrder.status }
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.collectionTask) {
    await createAuditTrailLog({
      moduleName: "Collections",
      entityType: "COLLECTION_TASK",
      entityId: result.collectionTask.id,
      recordReference: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit payment collection task created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeCollectionTask(result.collectionTask)
    });
  }

  refreshApp();
  redirect(`/invoices?view=${result.invoice.id}&success=${encodeURIComponent("Invoice generated")}`);
}

export async function decideSalesOrderApproval(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
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
  const decisionValue = getString(formData, "decision");
  if (decisionValue !== "Approved" && decisionValue !== "Rejected") {
    redirectWithMessage(
      `${requestedBasePath}?tab=approval`,
      "error",
      "Choose Approve or Reject for this sales order"
    );
  }
  const decision: SalesOrderApprovalStatus = decisionValue;
  const decisionNote = mergeActionNotes(
    normalizeActionNote(getString(formData, "decisionNote")),
    actionNote
  );
  if (requiresApprovalDecisionNote(decision) && !decisionNote) {
    redirectWithMessage(
      `${requestedBasePath}?tab=approval`,
      "error",
      "A rejection reason is required"
    );
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
    const rejectedOrder = await (async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          const claimedDecision = await tx.salesOrder.updateMany({
            where: {
              id: salesOrder.id,
              approvalStatus: "Pending"
            },
            data: {
              status: "Cancelled",
              approvalStatus: "Rejected",
              approvalDecisionNote: decisionNote,
              approvalDecidedAt: new Date(),
              approvalDecidedById: currentUser.id,
              notes: mergeActionNotes(salesOrder.notes, actionNote)
            }
          });

          if (claimedDecision.count !== 1) {
            throw new SalesOrderApprovalConflictError();
          }

          return tx.salesOrder.findUniqueOrThrow({
            where: { id: salesOrder.id }
          });
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

    await createAuditTrailLog({
      moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: rejectedOrder.id,
      recordReference: rejectedOrder.orderNumber,
      action: "REJECTED",
      actionNote,
      changeSummary: `Manager rejected ${orderLabel.toLowerCase()} ${rejectedOrder.orderNumber}`,
      oldValue: { status: salesOrder.status, approvalStatus: salesOrder.approvalStatus },
      newValue: {
        status: rejectedOrder.status,
        approvalStatus: rejectedOrder.approvalStatus,
        decisionNote: rejectedOrder.approvalDecisionNote
      }
    });

    refreshApp();
    redirectWithMessage(`${basePath}?tab=approval`, "success", `${orderLabel} rejected`);
  }

  const issueDate = new Date();
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType: salesOrder.paymentTermType,
    creditTermMonths: salesOrder.creditTermMonths,
    creditTermWeeks: salesOrder.creditTermWeeks
  });

  const result = await (async () => {
    try {
      return await withDocumentNumberRetry(
        ({ invoiceNumber }) =>
          prisma.$transaction(async (tx) => {
            const claimedDecision = await tx.salesOrder.updateMany({
              where: {
                id: salesOrder.id,
                approvalStatus: "Pending"
              },
              data: {
                status: "Invoiced",
                approvalStatus: "Approved",
                approvalDecisionNote: decisionNote,
                approvalDecidedAt: issueDate,
                approvalDecidedById: currentUser.id,
                notes: mergeActionNotes(salesOrder.notes, actionNote)
              }
            });

            if (claimedDecision.count !== 1) {
              throw new SalesOrderApprovalConflictError();
            }

            const invoice = await tx.invoice.create({
              data: {
                invoiceNumber: invoiceNumber as string,
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
                paymentTermType: salesOrder.paymentTermType,
                creditTermMonths: salesOrder.creditTermMonths,
                creditTermWeeks: salesOrder.creditTermWeeks,
                status: "Unpaid",
                notes: actionNote || null
              }
            });
            const approvedOrder = await tx.salesOrder.findUniqueOrThrow({
              where: { id: salesOrder.id }
            });
            const collectionTask =
              salesOrder.paymentTermType === "CREDIT"
                ? await tx.collectionTask.create({
                    data: {
                      customerId: salesOrder.customerId,
                      invoiceId: invoice.id,
                      scheduledDate: dueDate,
                      status: "Planned",
                      notes: `Credit payment collection reminder for ${invoiceNumber}`
                    }
                  })
                : null;
            return { invoice, salesOrder: approvedOrder, collectionTask };
          }),
        { includeInvoice: true }
      );
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

  await createAuditTrailLog({
    moduleName: isCustomerPo ? "Customer Purchase Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    recordReference: result.salesOrder.orderNumber,
    action: "APPROVED",
    actionNote,
    changeSummary: `Manager approved ${orderLabel.toLowerCase()} ${result.salesOrder.orderNumber}`,
    oldValue: { status: salesOrder.status, approvalStatus: salesOrder.approvalStatus },
    newValue: {
      status: result.salesOrder.status,
      approvalStatus: result.salesOrder.approvalStatus,
      decisionNote: result.salesOrder.approvalDecisionNote
    }
  });
  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated after Manager approval of ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    recordReference: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.collectionTask) {
    await createAuditTrailLog({
      moduleName: "Collections",
      entityType: "COLLECTION_TASK",
      entityId: result.collectionTask.id,
      recordReference: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit payment collection task created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeCollectionTask(result.collectionTask)
    });
  }

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
  const amount = parseAmount(formData.get("amount"));
  const paymentDate = new Date(getString(formData, "paymentDate") || new Date());
  const paymentMethod = getStatus<PaymentMethod>(
    formData,
    "paymentMethod",
    ["Cash", "BankTransfer", "Other"],
    "BankTransfer"
  );

  if (!invoiceId || amount <= 0) {
    redirectWithMessage(
      "/payments",
      "error",
      "Select an invoice and enter a payment amount"
    );
  }

  let result;
  try {
    result = await prisma.$transaction((tx) =>
      recordInvoicePayment(tx, {
        invoiceId,
        paymentDate,
        amount,
        paymentMethod,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote)
      })
    );
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
  const invoice = result.previousInvoice;

  await createAuditTrailLog({
    moduleName: "Payments",
    entityType: "PAYMENT",
    entityId: result.payment.id,
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
      paymentId: result.payment.id,
      amount: result.payment.amount,
      paymentMethod: result.payment.paymentMethod,
      notes: result.payment.notes,
      paidAmount: result.invoice.paidAmount,
      remainingAmount: result.invoice.remainingAmount,
      status: result.invoice.status
    }
  });
  if (invoice.status !== result.invoice.status) {
    await createAuditTrailLog({
      moduleName: "Invoices",
      entityType: "INVOICE",
      entityId: result.invoice.id,
      recordReference: invoice.invoiceNumber,
      action: "STATUS_CHANGED",
      actionNote,
      changeSummary: `Invoice status changed from ${invoice.status} to ${result.invoice.status}`,
      oldValue: summarizeInvoice(invoice),
      newValue: summarizeInvoice(result.invoice)
    });
  }
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    recordReference: invoice.invoiceNumber,
    action: result.invoice.remainingAmount <= 0 ? "RECEIVABLE_CLOSED" : "STATUS_CHANGED",
    actionNote,
    changeSummary:
      result.invoice.remainingAmount <= 0
        ? `Receivable closed for invoice ${invoice.invoiceNumber}`
        : `Receivable updated for invoice ${invoice.invoiceNumber}`,
    oldValue: summarizeInvoice(invoice),
    newValue: summarizeInvoice(result.invoice)
  });

  refreshApp();
  redirectWithMessage(`/payments?invoiceId=${invoiceId}`, "success", "Payment recorded");
}

export async function updateInvoiceNotes(formData: FormData) {
  await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id) {
    redirectWithMessage("/invoices", "error", "Invoice ID is required");
  }

  const oldInvoice = await prisma.invoice.findUnique({ where: { id } });

  if (!oldInvoice) {
    redirectWithMessage("/invoices", "error", "Invoice was not found");
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: {
      notes: mergeActionNotes(getString(formData, "notes"), actionNote)
    }
  });

  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: invoice.id,
    recordReference: invoice.invoiceNumber,
    action: "NOTE_UPDATED",
    actionNote,
    changeSummary: `Invoice notes updated for ${invoice.invoiceNumber}`,
    oldValue: { notes: oldInvoice.notes },
    newValue: { notes: invoice.notes }
  });

  refreshApp();
  redirect(`/invoices?view=${id}&success=${encodeURIComponent("Invoice notes updated")}`);
}

export async function createCollectionTask(formData: FormData) {
  await requireCurrentUser();
  const customerId = getRequiredString(formData, "customerId");
  const invoiceId = getString(formData, "invoiceId");
  const scheduledDate = new Date(getRequiredString(formData, "scheduledDate"));
  const notes = getRequiredString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!customerId || !notes) {
    redirectWithMessage("/collections", "error", "Customer and notes are required");
  }

  const collectionTask = await prisma.collectionTask.create({
    data: {
      customerId,
      invoiceId: invoiceId || null,
      scheduledDate,
      status: getStatus<CollectionTaskStatus>(
        formData,
        "status",
        ["Planned", "Done", "Cancelled"],
        "Planned"
      ),
      notes: mergeActionNotes(notes, actionNote) ?? notes
    },
    include: { customer: true, invoice: true }
  });

  await createAuditTrailLog({
    moduleName: "Collections",
    entityType: "COLLECTION_TASK",
    entityId: collectionTask.id,
    recordReference: collectionTask.invoice?.invoiceNumber ?? collectionTask.customer.companyName ?? collectionTask.id,
    action: "CREATED",
    actionNote,
    changeSummary: `Collection task created for ${collectionTask.invoice?.invoiceNumber ?? collectionTask.customer.companyName}`,
    newValue: summarizeCollectionTask(collectionTask)
  });

  refreshApp();
  redirectWithMessage("/collections", "success", "Collection task added");
}

export async function recordCustomerOutreach(formData: FormData) {
  await requireCurrentUser();
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

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, companyName: true, name: true }
  });

  if (!customer) {
    redirectWithMessage("/customer-outreach", "error", "Customer was not found");
  }

  const outreach = await prisma.customerOutreach.create({
    data: {
      customerId,
      contactDate,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote)
    }
  });

  await createAuditTrailLog({
    moduleName: "Customer Outreach",
    entityType: "CUSTOMER_OUTREACH",
    entityId: outreach.id,
    recordReference: customer.companyName || customer.name,
    action: "CONTACT_RECORDED",
    actionNote,
    changeSummary: `Customer outreach recorded for ${customer.companyName || customer.name}`,
    newValue: {
      customerId,
      contactDate: outreach.contactDate,
      notes: outreach.notes
    }
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
    redirectWithMessage("/surat-jalan?mode=create", "error", "Select at least one packed item, without duplicates");
  }

  const recipientName = getRequiredString(formData, "recipientName");
  const recipientPhone = getString(formData, "recipientPhone");
  const recipientAddress = getRequiredString(formData, "recipientAddress");
  const rawDeliveryDate = getRequiredString(formData, "deliveryDate");
  const deliveryDate = new Date(rawDeliveryDate);
  const deliveryAssignment = validateDeliveryAssignment({
    driverName: formData.get("driverName"),
    vehiclePlateNumber: formData.get("vehiclePlateNumber")
  });
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  const deliveryNote = await withDeliveryNoteNumberRetry(async (deliveryNoteNumber) => prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM picking_lists WHERE id IN (${Prisma.join([...pickingListIds].sort())}) ORDER BY id FOR UPDATE`);
    const lists = await tx.pickingList.findMany({
      relationLoadStrategy: "join",
      where: { id: { in: pickingListIds } },
      orderBy: { id: "asc" },
      select: {
        id: true, status: true, salesOrderId: true, pickerName: true, packerName: true,
        items: { select: {
          id: true, salesOrderItemId: true, itemName: true, orderedQuantity: true,
          availableQuantity: true, packedQuantity: true, availabilityStatus: true, notes: true
        } },
        deliveryNote: { select: { id: true } },
        deliverySource: { select: { id: true } },
        salesOrder: { select: {
          customerId: true, status: true, approvalStatus: true,
          items: { select: { id: true, itemName: true, quantity: true } },
          deliverySources: { select: { id: true } },
          invoice: { select: {
            id: true, status: true, paymentTermType: true,
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
        !canFulfillOrder(order) || !list.pickerName || !list.packerName ||
        !canCreateDeliveryFromPickingList(list.items) || order.deliveryNotes.length > 0 ||
        order.deliverySources.length > 0 || (order.invoice?.deliveryNotes.length ?? 0) > 0 ||
        (order.invoice?.deliverySources.length ?? 0) > 0 ||
        order.items.length !== list.items.length ||
        list.items.some(item => !order.items.some(source =>
          source.id === item.salesOrderItemId && source.itemName === item.itemName && source.quantity === item.orderedQuantity));
    })) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Picking List is not ready or the source order has changed");
    }

    const first = lists[0];
    if (lists.some(list => list.salesOrder.customerId !== first.salesOrder.customerId)) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "All selected orders must belong to the same customer and delivery destination");
    }

    const allItems = lists.flatMap(list => list.items);
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
      redirectWithMessage("/surat-jalan?mode=create", "error", "Selected items must be packed and each selected order must contain an item to deliver");
    }

    const finalQuantityByItemId = new Map<string, number>();
    for (const item of allItems) {
      if (!selectedItemIds.has(item.id)) continue;
      const rawQuantity = explicitItemSelection
        ? getString(formData, "quantity_" + item.id)
        : String(item.packedQuantity);
      const quantity = Number(rawQuantity);
      if (!rawQuantity || !Number.isInteger(quantity) || quantity < 1 || quantity > item.packedQuantity) {
        redirectWithMessage("/surat-jalan?mode=create", "error", "Final delivery quantity must be between one and the packed quantity");
      }
      finalQuantityByItemId.set(item.id, quantity);
    }
    if (!recipientName || !recipientAddress || !rawDeliveryDate || Number.isNaN(deliveryDate.getTime()) || !deliveryAssignment.valid) {
      redirectWithMessage("/surat-jalan?mode=create", "error", "Recipient, address, date, driver, and vehicle plate are required");
    }

    const note = await tx.deliveryNote.create({
      data: {
        deliveryNoteNumber,
        pickingListId: lists.length === 1 ? first.id : null,
        invoiceId: lists.length === 1 ? first.salesOrder.invoice!.id : null,
        salesOrderId: lists.length === 1 ? first.salesOrderId : null,
        customerId: first.salesOrder.customerId,
        recipientName, recipientPhone, recipientAddress, deliveryDate, status: "Draft",
        notes: getString(formData, "notes") || null,
        receiverName: getString(formData, "receiverName") || null,
        senderName: getString(formData, "senderName") || null,
        driverName: deliveryAssignment.value.driverName,
        vehiclePlateNumber: deliveryAssignment.value.vehiclePlateNumber,
        authorizedBy: getString(formData, "authorizedBy") || null,
        createdBy: currentUser.displayName || currentUser.username,
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
        packedQuantitySnapshot: item.packedQuantity,
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
  const deliveryDate = new Date(rawDeliveryDate);
  const deliveryAssignment = validateDeliveryAssignment({
    driverName: formData.get("driverName"),
    vehiclePlateNumber: formData.get("vehiclePlateNumber")
  });
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !version || !recipientName || !recipientAddress || !rawDeliveryDate ||
      Number.isNaN(deliveryDate.getTime()) || !deliveryAssignment.valid) {
    redirectWithMessage("/surat-jalan?tab=open&view=" + id, "error", "Recipient, address, date, driver, and vehicle plate are required");
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM delivery_notes WHERE id = ${id} FOR UPDATE`);
    const oldNote = await tx.deliveryNote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: "asc" } },
        sources: { select: { salesOrderId: true } }
      }
    });

    if (!oldNote) throw new Error("DELIVERY_NOTE_NOT_FOUND");
    if (oldNote.status !== "Draft") throw new Error("DELIVERY_NOTE_LOCKED");
    if (oldNote.updatedAt.toISOString() !== version) throw new Error("DELIVERY_NOTE_CONFLICT");

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
        recipientName, recipientPhone, recipientAddress, deliveryDate,
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
  notes?: string | null;
  listPrice: number;
  status: string;
}) {
  return {
    productName: product.productName,
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
}) {
  return {
    scheduledDate: collectionTask.scheduledDate.toISOString().slice(0, 10),
    status: collectionTask.status,
    notes: collectionTask.notes
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

async function withDeliveryNoteNumberRetry<T>(operation: (number: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation(await nextDeliveryNoteNumber());
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

async function nextDeliveryNoteNumber() {
  const year = new Date().getFullYear();
  const sequencePrefix = `SJ-${year}-`;
  const deliveryNotes = await prisma.deliveryNote.findMany({
    where: {
      deliveryNoteNumber: {
        startsWith: sequencePrefix
      }
    },
    select: {
      deliveryNoteNumber: true
    }
  });

  return nextNumberFromExisting({
    existingNumbers: deliveryNotes.map((deliveryNote) => deliveryNote.deliveryNoteNumber),
    prefix: "SJ",
    year
  });
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

async function withDocumentNumberRetry<T>(
  operation: (numbers: {
    orderNumber: string;
    customerPoNumber: string | null;
    invoiceNumber: string | null;
  }) => Promise<T>,
  options: { includeCustomerPo?: boolean; includeInvoice?: boolean } = {}
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [orderNumber, customerPoNumber, invoiceNumber] = await Promise.all([
      nextDocumentNumber("SO"),
      options.includeCustomerPo ? nextDocumentNumber("PO") : Promise.resolve(null),
      options.includeInvoice ? nextDocumentNumber("INV") : Promise.resolve(null)
    ]);

    try {
      return await operation({ orderNumber, customerPoNumber, invoiceNumber });
    } catch (error) {
      if (attempt === 0 && isDocumentNumberCollision(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to allocate a unique document number");
}

function isDocumentNumberCollision(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
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

function getCustomerPoDocument(formData: FormData) {
  const entry = formData.get("customerPoDocument");
  if (!(entry instanceof File) || entry.size === 0 || entry.size > CUSTOMER_PO_DOCUMENT_MAX_BYTES) {
    return null;
  }
  const extension = extname(entry.name).toLowerCase();
  const allowedMimeTypes = CUSTOMER_PO_DOCUMENT_TYPES[extension];
  return allowedMimeTypes?.includes(entry.type) ? entry : null;
}

async function storeCustomerPoDocument(file: File) {
  const extension = extname(file.name).toLowerCase();
  const storedName = `customer-purchase-orders/${randomUUID()}${extension}`;
  return uploadCustomerPoDocument(file, storedName);
}

function parseProductPrice(value: FormDataEntryValue | null) {
  const rawValue = String(value ?? "").trim();
  const parsed = Number(rawValue);

  if (!rawValue || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
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

async function linkCustomerInquiry(inquiryId: string, salesOrderId: string, isCustomerPo: boolean) {
  if (!inquiryId) return;
  await prisma.customerInquiry.update({
    where: { id: inquiryId },
    data: {
      salesOrderId,
      status: isCustomerPo ? "ConvertedToCustomerPO" : "ConvertedToSO",
      statusNote: isCustomerPo ? "Converted to Customer PO" : "Converted to Sales Order"
    }
  });
  refreshApp();
}

function redirectWithMessage(path: string, kind: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}
