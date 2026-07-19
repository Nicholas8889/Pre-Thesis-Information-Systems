"use server";

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CustomerStatus,
  CustomerInquiryStatus,
  DeliveryNoteStatus,
  FollowUpStatus,
  PaymentMethod,
  ProductStatus,
  SalesOrderApprovalStatus,
  TransactionType
} from "@prisma/client";
import {
  canCreateDeliveryNoteForInvoice,
  canRecordPayment,
  isValidSalesOrderPaymentTerm
} from "@/lib/calculations";
import { createAuditTrailLog } from "@/lib/audit";
import { getCustomerPaymentRisk } from "@/lib/customer-intelligence";
import { prisma } from "@/lib/prisma";
import { canRole } from "@/lib/role-access";
import {
  canGenerateInvoiceForApproval,
  requiresManagerApproval
} from "@/lib/sales-order-approval";
import { requireCurrentUser } from "@/lib/session";
import {
  canDeleteOngoingSalesOrder,
  deleteSalesOrderProcess
} from "@/lib/sales-order-deletion";
import { mergeActionNotes, normalizeActionNote } from "@/lib/action-notes";
import { parseOptionalInquiryPrice } from "@/lib/customer-inquiry";
import { completeCustomerInquiryForDeliveredOrder } from "@/lib/customer-inquiry-lifecycle";
import { nextNumberFromExisting } from "@/lib/document-numbering";
import {
  deletePreOrderDocument,
  PRE_ORDER_DOCUMENT_MAX_BYTES,
  PRE_ORDER_DOCUMENT_TYPES,
  uploadPreOrderDocument
} from "@/lib/pre-order-storage";
import {
  calculateOrderTotals,
  getDueDateForPaymentTerm,
  getInvoiceStatusForAmounts,
  getRemainingAmount,
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
  "/pre-orders",
  "/sales-orders",
  "/invoices",
  "/payments",
  "/surat-jalan",
  "/receivables",
  "/billing",
  "/follow-ups",
  "/audit-trail"
];

export async function createCustomer(formData: FormData) {
  await requireCurrentUser();
  const name = getRequiredString(formData, "name");
  const companyName = getRequiredString(formData, "companyName");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!name || !companyName) {
    redirectWithMessage("/customers", "error", "Customer name and company name are required");
  }

  const status = getStatus<CustomerStatus>(formData, "status", ["Active", "Inactive"], "Active");
  const customer = await prisma.customer.create({
    data: {
      name,
      companyName,
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      address: getString(formData, "address"),
      customerType: getString(formData, "customerType") || "Retail",
      status,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote)
    }
  });

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    transactionCode: customer.companyName || customer.name,
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
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !name || !companyName) {
    redirectWithMessage(
      "/customers",
      "error",
      "Customer ID, name, and company name are required"
    );
  }

  const oldCustomer = await prisma.customer.findUnique({ where: { id } });

  if (!oldCustomer) {
    redirectWithMessage("/customers", "error", "Customer was not found");
  }

  const status = getStatus<CustomerStatus>(formData, "status", ["Active", "Inactive"], "Active");
  const customer = await prisma.customer.update({
    where: { id },
    data: {
      name,
      companyName,
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      address: getString(formData, "address"),
      customerType: getString(formData, "customerType") || "Retail",
      status,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote)
    }
  });

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    transactionCode: customer.companyName || customer.name,
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
    transactionCode: customer.companyName || customer.name,
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
  const basePrice = parseProductBasePrice(formData.get("basePrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!productName) {
    redirectWithMessage("/products", "error", "Product name is required");
  }

  if (basePrice === null) {
    redirectWithMessage("/products", "error", "Base price must be a valid non-negative amount");
  }

  const status = getStatus<ProductStatus>(formData, "status", ["Active", "Inactive"], "Active");
  const product = await prisma.product.create({
    data: {
      productName,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote),
      basePrice,
      status
    }
  });

  await createAuditTrailLog({
    moduleName: "Products",
    entityType: "PRODUCT",
    entityId: product.id,
    transactionCode: product.productName,
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
  const basePrice = parseProductBasePrice(formData.get("basePrice"));
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!id || !productName) {
    redirectWithMessage("/products", "error", "Product ID and product name are required");
  }

  if (basePrice === null) {
    redirectWithMessage("/products", "error", "Base price must be a valid non-negative amount");
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
      basePrice,
      status
    }
  });

  await createAuditTrailLog({
    moduleName: "Products",
    entityType: "PRODUCT",
    entityId: product.id,
    transactionCode: product.productName,
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
    transactionCode: product.productName,
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
        requestedPrice: parseOptionalInquiryPrice(item?.requestedPrice),
        agreedPrice: parseOptionalInquiryPrice(item?.agreedPrice),
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
  await createAuditTrailLog({ moduleName: "Customer Inquiry", entityType: "CUSTOMER_INQUIRY", entityId: inquiry.id, transactionCode: inquiry.inquiryNumber, action: "CREATED", changeSummary: `Customer inquiry ${inquiry.inquiryNumber} created for ${customer.companyName}`, newValue: { status: inquiry.status, itemCount: items.length } });
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
  await createAuditTrailLog({ moduleName: "Customer Inquiry", entityType: "CUSTOMER_INQUIRY", entityId: inquiryId, transactionCode: inquiry.inquiryNumber, action: status === "Cancelled" ? "CANCELLED" : "CLOSED", changeSummary: `Customer inquiry ${inquiry.inquiryNumber} marked ${status.toLowerCase()} by ${currentUser.displayName}`, newValue: { status, statusNote } });
  refreshApp();
  redirectWithMessage(`/customer-inquiries/${inquiryId}`, "success", `Inquiry marked ${status.toLowerCase()}`);
}

export async function createSalesOrder(formData: FormData) {
  const transactionType = getStatus<TransactionType>(
    formData,
    "transactionType",
    ["SALES_ORDER", "PRE_ORDER"],
    "SALES_ORDER"
  );
  const isPreOrder = transactionType === "PRE_ORDER";
  const basePath = isPreOrder ? "/pre-orders" : "/sales-orders";
  const moduleName = isPreOrder ? "Pre Orders" : "Sales Orders";
  const transactionLabel = isPreOrder ? "Pre order" : "Sales order";
  const customerId = getRequiredString(formData, "customerId");
  const inquiryId = getString(formData, "inquiryId");
  const rawItems = getString(formData, "items");
  const notes = getString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const submittedItems = normalizeOrderItems(safeJsonParse(rawItems));
  const rawPaymentTermType = getString(formData, "paymentTermType");
  const rawCreditTermMonths = formData.get("creditTermMonths");
  const { paymentTermType, creditTermMonths } = normalizePaymentTerm({
    paymentTermType: rawPaymentTermType,
    creditTermMonths: rawCreditTermMonths
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
      creditTermMonths: rawCreditTermMonths === null ? null : Number(rawCreditTermMonths)
    })
  ) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Select Debit or choose a Credit term from 1 to 12 months"
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
        select: {
          dueDate: true,
          remainingAmount: true,
          status: true,
          payments: { select: { paymentDate: true } }
        }
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
  const requiredDate = isPreOrder
    ? parseDateInput(getString(formData, "requiredDate"))
    : null;
  const poDocument = isPreOrder ? getPreOrderDocument(formData) : null;

  if (isPreOrder && !requiredDate) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "A valid product required date is required"
    );
  }

  if (isPreOrder && !poDocument) {
    redirectWithMessage(
      `${basePath}?mode=create`,
      "error",
      "Upload the customer PO document as PDF, JPG, PNG, DOC, or DOCX"
    );
  }

  const orderNumber = await nextDocumentNumber("SO");
  const poNumber = isPreOrder ? await nextDocumentNumber("PO") : null;
  const storedDocument = poDocument ? await storePreOrderDocument(poDocument) : null;
  const transactionData = {
    transactionType,
    poNumber,
    requiredDate,
    poDocumentName: storedDocument?.originalName ?? null,
    poDocumentStoredName: storedDocument?.storedName ?? null,
    poDocumentMimeType: storedDocument?.mimeType ?? null
  };
  const paymentRisk = getCustomerPaymentRisk(customer);
  const needsApproval = requiresManagerApproval(currentUser?.role ?? "", paymentRisk);

  if (needsApproval) {
    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber,
        ...transactionData,
        customerId,
        orderDate: new Date(),
        status: "Draft",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: mergeActionNotes(notes, actionNote),
        approvalStatus: "Pending",
        approvalRisk: paymentRisk,
        createdByUserId: currentUser?.id ?? null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            itemName: item.itemName,
            quantity: item.quantity,
            basePrice: item.basePrice,
            markupPercent: item.markupPercent,
            discountPercent: item.discountPercent,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice
          }))
        }
      }
    });
    await linkCustomerInquiry(inquiryId, salesOrder.id, isPreOrder);

    await createAuditTrailLog({
      moduleName,
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      transactionCode: salesOrder.orderNumber,
      action: "APPROVAL_REQUESTED",
      actionNote,
      changeSummary: `${transactionLabel} ${salesOrder.orderNumber} requires Manager approval because the customer is ${paymentRisk}`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        poNumber: salesOrder.poNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        approvalRisk: paymentRisk,
        total: salesOrder.total,
        items: summarizeOrderPricing(items)
      }
    });

    refreshApp();
    redirectWithMessage(
      `${basePath}?tab=approval`,
      "success",
      `${transactionLabel} submitted for Manager approval`
    );
  }

  if (currentUser?.role === "SALES") {
    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber,
        ...transactionData,
        customerId,
        orderDate: new Date(),
        status: "Confirmed",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: mergeActionNotes(notes, actionNote),
        approvalStatus: "NotRequired",
        createdByUserId: currentUser.id,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            itemName: item.itemName,
            quantity: item.quantity,
            basePrice: item.basePrice,
            markupPercent: item.markupPercent,
            discountPercent: item.discountPercent,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice
          }))
        }
      }
    });
    await linkCustomerInquiry(inquiryId, salesOrder.id, isPreOrder);

    await createAuditTrailLog({
      moduleName,
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      transactionCode: salesOrder.orderNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `${transactionLabel} ${salesOrder.orderNumber} created and is ready for Admin or Manager invoicing`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        poNumber: salesOrder.poNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        total: salesOrder.total,
        paymentTermType: salesOrder.paymentTermType,
        items: summarizeOrderPricing(items)
      }
    });

    refreshApp();
    redirectWithMessage(
      `${basePath}?view=${salesOrder.id}`,
      "success",
      `${transactionLabel} created. Admin or Manager can generate the invoice`
    );
  }

  const invoiceNumber = await nextDocumentNumber("INV");
  const issueDate = new Date();
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType,
    creditTermMonths
  });

  const result = await prisma.$transaction(async (tx) => {
    const salesOrder = await tx.salesOrder.create({
      data: {
        orderNumber,
        ...transactionData,
        customerId,
        orderDate: issueDate,
        status: "Invoiced",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: mergeActionNotes(notes, actionNote),
        approvalStatus: "NotRequired",
        createdByUserId: currentUser?.id ?? null,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            itemName: item.itemName,
            quantity: item.quantity,
            basePrice: item.basePrice,
            markupPercent: item.markupPercent,
            discountPercent: item.discountPercent,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice
          }))
        }
      }
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
        paymentTermType,
        creditTermMonths,
        status: "Unpaid",
        notes: actionNote || null
      }
    });

    const followUp =
      paymentTermType === "CREDIT"
        ? await tx.followUp.create({
        data: {
          customerId,
          invoiceId: createdInvoice.id,
          followUpDate: dueDate,
          status: "Planned",
          notes: `Credit billing reminder for ${invoiceNumber}`
        }
          })
        : null;

    return { salesOrder, invoice: createdInvoice, followUp };
  });

  await linkCustomerInquiry(inquiryId, result.salesOrder.id, isPreOrder);

  await createAuditTrailLog({
    moduleName,
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `${transactionLabel} ${result.salesOrder.orderNumber} created and invoiced`,
    newValue: {
      orderNumber: result.salesOrder.orderNumber,
      poNumber: result.salesOrder.poNumber,
      status: result.salesOrder.status,
      total: result.salesOrder.total,
      paymentTermType: result.salesOrder.paymentTermType,
      creditTermMonths: result.salesOrder.creditTermMonths,
      items: summarizeOrderPricing(items)
    }
  });
  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from sales order ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.followUp) {
    await createAuditTrailLog({
      moduleName: "Billing",
      entityType: "FOLLOW_UP",
      entityId: result.followUp.id,
      transactionCode: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirect(
    `/invoices?view=${result.invoice.id}&success=${encodeURIComponent(
      `${transactionLabel} confirmed and invoice generated`
    )}`
  );
}

export async function deleteSalesOrder(formData: FormData) {
  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const requestedBasePath = getString(formData, "returnPath") === "/pre-orders"
    ? "/pre-orders"
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
          followUps: true,
          deliveryNotes: { select: { id: true, status: true } }
        }
      },
      deliveryNotes: { select: { id: true, status: true } },
      items: { select: { id: true } }
    }
  });

  if (!salesOrder) {
    redirectWithMessage(requestedBasePath, "error", "Transaction was not found");
  }

  const isPreOrder = salesOrder.transactionType === "PRE_ORDER";
  const basePath = isPreOrder ? "/pre-orders" : "/sales-orders";
  const transactionLabel = isPreOrder ? "Pre order" : "Sales order";

  if (
    !canDeleteOngoingSalesOrder({
      salesOrderStatus: salesOrder.status,
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
      "Completed, delivered, paid, or cancelled Sales Orders cannot be deleted"
    );
  }

  const invoiceId = salesOrder.invoice?.id;
  const deletedSummary = {
    orderNumber: salesOrder.orderNumber,
    status: salesOrder.status,
    invoiceNumber: salesOrder.invoice?.invoiceNumber ?? null,
    itemCount: salesOrder.items.length,
    paymentCount: salesOrder.invoice?.payments.length ?? 0,
    billingCount: salesOrder.invoice?.followUps.length ?? 0,
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

  if (salesOrder.poDocumentStoredName) {
    await deletePreOrderDocument(salesOrder.poDocumentStoredName).catch(() => undefined);
  }

  await createAuditTrailLog({
    moduleName: isPreOrder ? "Pre Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: salesOrder.id,
    transactionCode: salesOrder.orderNumber,
    action: "DELETED",
    actionNote,
    changeSummary: `Ongoing ${transactionLabel.toLowerCase()} ${salesOrder.orderNumber} and its related process records were deleted`,
    oldValue: deletedSummary
  });

  refreshApp();
  redirectWithMessage(
    basePath,
    "success",
    `${transactionLabel} ${salesOrder.orderNumber} and its related records were deleted`
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

  const isPreOrder = salesOrder.transactionType === "PRE_ORDER";
  const basePath = isPreOrder ? "/pre-orders" : "/sales-orders";
  const transactionLabel = isPreOrder ? "Pre order" : "Sales order";

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
    creditTermMonths: salesOrder.creditTermMonths
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
        paymentTermType: salesOrder.paymentTermType,
        creditTermMonths: salesOrder.creditTermMonths,
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

    const followUp =
      salesOrder.paymentTermType === "CREDIT"
        ? await tx.followUp.create({
        data: {
          customerId: salesOrder.customerId,
          invoiceId: createdInvoice.id,
          followUpDate: dueDate,
          status: "Planned",
          notes: `Credit billing reminder for ${invoiceNumber}`
        }
          })
        : null;

    return { invoice: createdInvoice, salesOrder: updatedSalesOrder, followUp };
  });

  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from ${transactionLabel.toLowerCase()} ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: isPreOrder ? "Pre Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "STATUS_CHANGED",
    actionNote,
    changeSummary: `${transactionLabel} status changed to ${result.salesOrder.status}`,
    oldValue: { status: salesOrder.status },
    newValue: { status: result.salesOrder.status }
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.followUp) {
    await createAuditTrailLog({
      moduleName: "Billing",
      entityType: "FOLLOW_UP",
      entityId: result.followUp.id,
      transactionCode: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirect(`/invoices?view=${result.invoice.id}&success=${encodeURIComponent("Invoice generated")}`);
}

export async function decideSalesOrderApproval(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const requestedBasePath = getString(formData, "returnPath") === "/pre-orders"
    ? "/pre-orders"
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
  const decisionNote = mergeActionNotes(getString(formData, "decisionNote"), actionNote);
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { invoice: true, customer: true }
  });

  if (!salesOrder) {
    redirectWithMessage(`${requestedBasePath}?tab=approval`, "error", "Transaction was not found");
  }
  const isPreOrder = salesOrder.transactionType === "PRE_ORDER";
  const basePath = isPreOrder ? "/pre-orders" : "/sales-orders";
  const transactionLabel = isPreOrder ? "Pre order" : "Sales order";
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
    const rejectedOrder = await prisma.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        status: "Cancelled",
        approvalStatus: "Rejected",
        approvalDecisionNote: decisionNote || null,
        approvalDecidedAt: new Date(),
        approvalDecidedById: currentUser.id,
        notes: mergeActionNotes(salesOrder.notes, actionNote)
      }
    });

    await createAuditTrailLog({
      moduleName: isPreOrder ? "Pre Orders" : "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: rejectedOrder.id,
      transactionCode: rejectedOrder.orderNumber,
      action: "REJECTED",
      actionNote,
      changeSummary: `Manager rejected ${transactionLabel.toLowerCase()} ${rejectedOrder.orderNumber}`,
      oldValue: { status: salesOrder.status, approvalStatus: salesOrder.approvalStatus },
      newValue: {
        status: rejectedOrder.status,
        approvalStatus: rejectedOrder.approvalStatus,
        decisionNote: rejectedOrder.approvalDecisionNote
      }
    });

    refreshApp();
    redirectWithMessage(`${basePath}?tab=approval`, "success", `${transactionLabel} rejected`);
  }

  const issueDate = new Date();
  const dueDate = getDueDateForPaymentTerm({
    issueDate,
    paymentTermType: salesOrder.paymentTermType,
    creditTermMonths: salesOrder.creditTermMonths
  });
  const invoiceNumber = await nextDocumentNumber("INV");

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        salesOrderId: salesOrder.id,
        customerId: salesOrder.customerId,
        issueDate,
        dueDate,
        totalAmount: salesOrder.total,
        paidAmount: 0,
        remainingAmount: salesOrder.total,
        paymentTermType: salesOrder.paymentTermType,
        creditTermMonths: salesOrder.creditTermMonths,
        status: "Unpaid",
        notes: actionNote || null
      }
    });
    const approvedOrder = await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        status: "Invoiced",
        approvalStatus: "Approved",
        approvalDecisionNote: decisionNote || null,
        approvalDecidedAt: issueDate,
        approvalDecidedById: currentUser.id,
        notes: mergeActionNotes(salesOrder.notes, actionNote)
      }
    });
    const followUp =
      salesOrder.paymentTermType === "CREDIT"
        ? await tx.followUp.create({
            data: {
              customerId: salesOrder.customerId,
              invoiceId: invoice.id,
              followUpDate: dueDate,
              status: "Planned",
              notes: `Credit billing reminder for ${invoiceNumber}`
            }
          })
        : null;
    return { invoice, salesOrder: approvedOrder, followUp };
  });

  await createAuditTrailLog({
    moduleName: isPreOrder ? "Pre Orders" : "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "APPROVED",
    actionNote,
    changeSummary: `Manager approved ${transactionLabel.toLowerCase()} ${result.salesOrder.orderNumber}`,
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
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated after Manager approval of ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Receivable created from invoice ${result.invoice.invoiceNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  if (result.followUp) {
    await createAuditTrailLog({
      moduleName: "Billing",
      entityType: "FOLLOW_UP",
      entityId: result.followUp.id,
      transactionCode: result.invoice.invoiceNumber,
      action: "CREATED",
      actionNote,
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirectWithMessage(
    `${basePath}?tab=approval`,
    "success",
    `${transactionLabel} approved and invoice generated`
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

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    redirectWithMessage("/payments", "error", "Invoice was not found");
  }

  if (!canRecordPayment(invoice.remainingAmount, amount)) {
    redirectWithMessage(
      "/payments",
      "error",
      "Payment cannot exceed remaining invoice amount"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        paymentDate,
        amount,
        paymentMethod,
        notes: mergeActionNotes(getString(formData, "notes"), actionNote)
      }
    });

    const paidAmount = invoice.paidAmount + amount;
    const remainingAmount = getRemainingAmount(invoice.totalAmount, paidAmount);
    const status = getInvoiceStatusForAmounts({
      totalAmount: invoice.totalAmount,
      paidAmount,
      dueDate: invoice.dueDate
    });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount,
        remainingAmount,
        status
      }
    });

    return { payment, invoice: updatedInvoice };
  });

  await createAuditTrailLog({
    moduleName: "Payments",
    entityType: "PAYMENT",
    entityId: result.payment.id,
    transactionCode: invoice.invoiceNumber,
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
      transactionCode: invoice.invoiceNumber,
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
    transactionCode: invoice.invoiceNumber,
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
    transactionCode: invoice.invoiceNumber,
    action: "NOTE_UPDATED",
    actionNote,
    changeSummary: `Invoice notes updated for ${invoice.invoiceNumber}`,
    oldValue: { notes: oldInvoice.notes },
    newValue: { notes: invoice.notes }
  });

  refreshApp();
  redirect(`/invoices?view=${id}&success=${encodeURIComponent("Invoice notes updated")}`);
}

export async function createFollowUp(formData: FormData) {
  await requireCurrentUser();
  const customerId = getRequiredString(formData, "customerId");
  const invoiceId = getString(formData, "invoiceId");
  const followUpDate = new Date(getRequiredString(formData, "followUpDate"));
  const notes = getRequiredString(formData, "notes");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!customerId || !notes) {
    redirectWithMessage("/billing", "error", "Customer and notes are required");
  }

  const followUp = await prisma.followUp.create({
    data: {
      customerId,
      invoiceId: invoiceId || null,
      followUpDate,
      status: getStatus<FollowUpStatus>(
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
    moduleName: "Billing",
    entityType: "FOLLOW_UP",
    entityId: followUp.id,
    transactionCode: followUp.invoice?.invoiceNumber ?? followUp.customer.companyName ?? followUp.id,
    action: "CREATED",
    actionNote,
    changeSummary: `Billing record created for ${followUp.invoice?.invoiceNumber ?? followUp.customer.companyName}`,
    newValue: summarizeFollowUp(followUp)
  });

  refreshApp();
  redirectWithMessage("/billing", "success", "Billing record added");
}

export async function recordCustomerProductFollowUp(formData: FormData) {
  await requireCurrentUser();
  const customerId = getRequiredString(formData, "customerId");
  const contactDateValue = getRequiredString(formData, "contactDate");
  const contactDate = new Date(`${contactDateValue}T00:00:00`);
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));

  if (!customerId || !contactDateValue || Number.isNaN(contactDate.getTime())) {
    redirectWithMessage(
      "/follow-ups",
      "error",
      "Customer and a valid contact date are required"
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, companyName: true, name: true }
  });

  if (!customer) {
    redirectWithMessage("/follow-ups", "error", "Customer was not found");
  }

  const productFollowUp = await prisma.customerProductFollowUp.create({
    data: {
      customerId,
      contactDate,
      notes: mergeActionNotes(getString(formData, "notes"), actionNote)
    }
  });

  await createAuditTrailLog({
    moduleName: "Follow Up",
    entityType: "CUSTOMER_PRODUCT_FOLLOW_UP",
    entityId: productFollowUp.id,
    transactionCode: customer.companyName || customer.name,
    action: "CONTACT_RECORDED",
    actionNote,
    changeSummary: `Product follow-up contact recorded for ${customer.companyName || customer.name}`,
    newValue: {
      customerId,
      contactDate: productFollowUp.contactDate,
      notes: productFollowUp.notes
    }
  });

  refreshApp();
  redirectWithMessage("/follow-ups", "success", "Customer follow-up recorded");
}

export async function createDeliveryNote(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  if (!canRole(currentUser?.role, "CREATE_SURAT_JALAN")) {
    redirectWithMessage(
      "/surat-jalan",
      "error",
      "Only Admin and Manager roles can create Surat Jalan"
    );
  }

  const customerId = getRequiredString(formData, "customerId");
  const invoiceId = getString(formData, "invoiceId");
  const salesOrderId = getString(formData, "salesOrderId");
  const recipientName = getRequiredString(formData, "recipientName");
  const recipientPhone = getString(formData, "recipientPhone");
  const recipientAddress = getRequiredString(formData, "recipientAddress");
  const deliveryDate = new Date(getRequiredString(formData, "deliveryDate"));
  const senderName = getString(formData, "senderName");
  const authorizedBy = getString(formData, "authorizedBy");
  const items = normalizeDeliveryNoteItems(safeJsonParse(getString(formData, "items")));

  if (!customerId || !recipientName || !recipientAddress || items.length === 0) {
    redirectWithMessage(
      "/surat-jalan?mode=create",
      "error",
      "Customer, recipient, address, and at least one item are required"
    );
  }

  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { paymentTermType: true, status: true }
    });

    if (
      invoice &&
      !canCreateDeliveryNoteForInvoice({
        paymentTermType: invoice.paymentTermType,
        status: invoice.status
      })
    ) {
      redirectWithMessage(
        `/surat-jalan?mode=create&invoiceId=${invoiceId}`,
        "error",
        "Debit transaction must be paid before Surat Jalan can be created"
      );
    }
  }

  const deliveryNoteNumber = await nextDeliveryNoteNumber();

  const deliveryNote = await prisma.deliveryNote.create({
    data: {
      deliveryNoteNumber,
      invoiceId: invoiceId || null,
      salesOrderId: salesOrderId || null,
      customerId,
      recipientName,
      recipientPhone,
      recipientAddress,
      deliveryDate,
      status: "Issued",
      notes: mergeActionNotes(getString(formData, "notes"), actionNote),
      receiverName: getString(formData, "receiverName") || null,
      senderName: senderName || null,
      authorizedBy: authorizedBy || null,
      items: {
        create: items.map((item) => ({
          productCode: item.productCode || null,
          itemName: item.itemName,
          quantity: item.quantity,
          unit: item.unit,
          description: item.description || null
        }))
      }
    },
    include: {
      invoice: true,
      salesOrder: true
    }
  });

  await createAuditTrailLog({
    moduleName: "Surat Jalan",
    entityType: "DELIVERY_NOTE",
    entityId: deliveryNote.id,
    transactionCode: deliveryNote.deliveryNoteNumber,
    action: "CREATED",
    actionNote,
    changeSummary: `Surat Jalan ${deliveryNote.deliveryNoteNumber} created`,
    newValue: {
      deliveryNoteNumber: deliveryNote.deliveryNoteNumber,
      invoiceNumber: deliveryNote.invoice?.invoiceNumber,
      orderNumber: deliveryNote.salesOrder?.orderNumber,
      status: deliveryNote.status,
      recipientName: deliveryNote.recipientName
    }
  });

  refreshApp();
  redirect(
    `/surat-jalan?view=${deliveryNote.id}&success=${encodeURIComponent("Surat Jalan created")}`
  );
}

export async function updateDeliveryNoteStatus(formData: FormData) {
  await requireCurrentUser();
  const id = getRequiredString(formData, "id");
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  const status = getStatus<DeliveryNoteStatus>(
    formData,
    "status",
    ["Draft", "Issued", "Delivered", "Cancelled"],
    "Issued"
  );

  if (!id) {
    redirectWithMessage("/surat-jalan", "error", "Surat Jalan ID is required");
  }

  const oldDeliveryNote = await prisma.deliveryNote.findUnique({
    where: { id },
    select: { id: true, deliveryNoteNumber: true, status: true, notes: true }
  });

  if (!oldDeliveryNote) {
    redirectWithMessage("/surat-jalan", "error", "Surat Jalan was not found");
  }

  const deliveryNote = await prisma.deliveryNote.update({
    where: { id },
    data: { status, notes: mergeActionNotes(oldDeliveryNote.notes, actionNote) }
  });

  await createAuditTrailLog({
    moduleName: "Surat Jalan",
    entityType: "DELIVERY_NOTE",
    entityId: deliveryNote.id,
    transactionCode: deliveryNote.deliveryNoteNumber,
    action: deliveryNote.status === "Delivered" ? "DELIVERED" : "STATUS_CHANGED",
    actionNote,
    changeSummary: `Surat Jalan status changed from ${oldDeliveryNote.status} to ${deliveryNote.status}`,
    oldValue: { status: oldDeliveryNote.status },
    newValue: { status: deliveryNote.status }
  });

  if (deliveryNote.status === "Delivered") {
    await completeLinkedCustomerInquiry(deliveryNote.salesOrderId);
  }

  refreshApp();
  redirect(`/surat-jalan?view=${id}&success=${encodeURIComponent("Surat Jalan status updated")}`);
}

function summarizeCustomer(customer: {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  customerType: string;
  status: string;
  notes?: string | null;
}) {
  return {
    name: customer.name,
    companyName: customer.companyName,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    customerType: customer.customerType,
    status: customer.status,
    notes: customer.notes
  };
}

function summarizeProduct(product: {
  productName: string;
  notes?: string | null;
  basePrice: number;
  status: string;
}) {
  return {
    productName: product.productName,
    notes: product.notes,
    basePrice: product.basePrice,
    status: product.status
  };
}

function summarizeOrderPricing(
  items: Array<{
    productId: string;
    itemName: string;
    quantity: number;
    basePrice: number;
    markupPercent: number;
    discountPercent: number;
    unitPrice: number;
  }>
) {
  return items.map((item) => ({
    productId: item.productId,
    productName: item.itemName,
    quantity: item.quantity,
    basePrice: item.basePrice,
    markupPercent: item.markupPercent,
    discountPercent: item.discountPercent,
    adjustedUnitPrice: item.unitPrice,
    subtotal: item.quantity * item.unitPrice
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
  notes?: string | null;
}) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    remainingAmount: invoice.remainingAmount,
    status: invoice.status,
    paymentTermType: invoice.paymentTermType,
    creditTermMonths: invoice.creditTermMonths,
    notes: invoice.notes
  };
}

function summarizeFollowUp(followUp: {
  followUpDate: Date;
  status: string;
  notes: string;
}) {
  return {
    followUpDate: followUp.followUpDate.toISOString().slice(0, 10),
    status: followUp.status,
    notes: followUp.notes
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function normalizeDeliveryNoteItems(rawItems: unknown) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        productCode: String(record.productCode ?? "").trim(),
        itemName: String(record.itemName ?? "").trim(),
        quantity: Number(record.quantity),
        unit: getAllowedUnit(String(record.unit ?? "PCS").trim()),
        description: String(record.description ?? "").trim()
      };
    })
    .filter(
      (item) =>
        item.itemName.length > 0 &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0
    );
}

function getAllowedUnit(value: string) {
  return ["PCS", "ROLL", "KG", "BOX", "OTHER"].includes(value) ? value : "PCS";
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

function getPreOrderDocument(formData: FormData) {
  const entry = formData.get("poDocument");
  if (!(entry instanceof File) || entry.size === 0 || entry.size > PRE_ORDER_DOCUMENT_MAX_BYTES) {
    return null;
  }
  const extension = extname(entry.name).toLowerCase();
  const allowedMimeTypes = PRE_ORDER_DOCUMENT_TYPES[extension];
  return allowedMimeTypes?.includes(entry.type) ? entry : null;
}

async function storePreOrderDocument(file: File) {
  const extension = extname(file.name).toLowerCase();
  const storedName = `pre-orders/${randomUUID()}${extension}`;
  return uploadPreOrderDocument(file, storedName);
}

function parseProductBasePrice(value: FormDataEntryValue | null) {
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

async function linkCustomerInquiry(inquiryId: string, salesOrderId: string, isPreOrder: boolean) {
  if (!inquiryId) return;
  await prisma.customerInquiry.update({
    where: { id: inquiryId },
    data: {
      salesOrderId,
      status: isPreOrder ? "ConvertedToPO" : "ConvertedToSO",
      statusNote: isPreOrder ? "Converted to Pre Order" : "Converted to Sales Order"
    }
  });
  refreshApp();
}

async function completeLinkedCustomerInquiry(salesOrderId: string | null) {
  if (!salesOrderId) return;

  const inquiry = await completeCustomerInquiryForDeliveredOrder(prisma, salesOrderId);

  if (!inquiry) return;
  await createAuditTrailLog({
    moduleName: "Customer Inquiry",
    entityType: "CUSTOMER_INQUIRY",
    entityId: inquiry.id,
    transactionCode: inquiry.inquiryNumber,
    action: "COMPLETED",
    changeSummary: `Customer inquiry ${inquiry.inquiryNumber} completed after linked order delivery`,
    oldValue: { status: inquiry.status },
    newValue: { status: "Done", salesOrderId }
  });
}

function redirectWithMessage(path: string, kind: "success" | "error", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`);
}
