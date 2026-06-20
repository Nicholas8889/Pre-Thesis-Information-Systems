"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  CustomerStatus,
  DeliveryNoteStatus,
  FollowUpStatus,
  PaymentMethod,
  SalesOrderApprovalStatus
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
import { getCurrentUser } from "@/lib/session";
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
  const name = getRequiredString(formData, "name");
  const companyName = getRequiredString(formData, "companyName");

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
      notes: getString(formData, "notes") || null
    }
  });

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    transactionCode: customer.companyName || customer.name,
    action: "CREATED",
    changeSummary: `Customer ${customer.companyName || customer.name} created`,
    newValue: summarizeCustomer(customer)
  });

  refreshApp();
  redirectWithMessage("/customers", "success", "Customer added");
}

export async function updateCustomer(formData: FormData) {
  const id = getRequiredString(formData, "id");
  const name = getRequiredString(formData, "name");
  const companyName = getRequiredString(formData, "companyName");

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
      notes: getString(formData, "notes") || null
    }
  });

  await createAuditTrailLog({
    moduleName: "Customers",
    entityType: "CUSTOMER",
    entityId: customer.id,
    transactionCode: customer.companyName || customer.name,
    action: oldCustomer.status !== customer.status ? "STATUS_CHANGED" : "UPDATED",
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

export async function createSalesOrder(formData: FormData) {
  const customerId = getRequiredString(formData, "customerId");
  const rawItems = getString(formData, "items");
  const notes = getString(formData, "notes");
  const items = normalizeOrderItems(safeJsonParse(rawItems));
  const rawPaymentTermType = getString(formData, "paymentTermType");
  const rawCreditTermMonths = formData.get("creditTermMonths");
  const { paymentTermType, creditTermMonths } = normalizePaymentTerm({
    paymentTermType: rawPaymentTermType,
    creditTermMonths: rawCreditTermMonths
  });

  if (!customerId || items.length === 0) {
    redirectWithMessage(
      "/sales-orders",
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
      "/sales-orders?mode=create",
      "error",
      "Select Debit or choose a Credit term from 1 to 12 months"
    );
  }

  const currentUser = await getCurrentUser();
  if (!canRole(currentUser?.role, "CREATE_SALES_ORDER")) {
    redirectWithMessage(
      "/sales-orders",
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
    redirectWithMessage("/sales-orders?mode=create", "error", "Customer was not found");
  }

  const totals = calculateOrderTotals(items);
  const orderNumber = await nextDocumentNumber("SO");
  const paymentRisk = getCustomerPaymentRisk(customer);
  const needsApproval = requiresManagerApproval(currentUser?.role ?? "", paymentRisk);

  if (needsApproval) {
    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber,
        customerId,
        orderDate: new Date(),
        status: "Draft",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: notes || null,
        approvalStatus: "Pending",
        approvalRisk: paymentRisk,
        createdByUserId: currentUser?.id ?? null,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice
          }))
        }
      }
    });

    await createAuditTrailLog({
      moduleName: "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      transactionCode: salesOrder.orderNumber,
      action: "APPROVAL_REQUESTED",
      changeSummary: `Sales order ${salesOrder.orderNumber} requires Manager approval because the customer is ${paymentRisk}`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        approvalRisk: paymentRisk,
        total: salesOrder.total
      }
    });

    refreshApp();
    redirectWithMessage(
      "/sales-orders?tab=approval",
      "success",
      "Sales order submitted for Manager approval"
    );
  }

  if (currentUser?.role === "SALES") {
    const salesOrder = await prisma.salesOrder.create({
      data: {
        orderNumber,
        customerId,
        orderDate: new Date(),
        status: "Confirmed",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: notes || null,
        approvalStatus: "NotRequired",
        createdByUserId: currentUser.id,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice
          }))
        }
      }
    });

    await createAuditTrailLog({
      moduleName: "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: salesOrder.id,
      transactionCode: salesOrder.orderNumber,
      action: "CREATED",
      changeSummary: `Sales order ${salesOrder.orderNumber} created and is ready for Admin or Manager invoicing`,
      newValue: {
        orderNumber: salesOrder.orderNumber,
        status: salesOrder.status,
        approvalStatus: salesOrder.approvalStatus,
        total: salesOrder.total,
        paymentTermType: salesOrder.paymentTermType
      }
    });

    refreshApp();
    redirectWithMessage(
      `/sales-orders?view=${salesOrder.id}`,
      "success",
      "Sales order created. Admin or Manager can generate the invoice"
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
        customerId,
        orderDate: issueDate,
        status: "Invoiced",
        subtotal: totals.subtotal,
        total: totals.total,
        paymentTermType,
        creditTermMonths,
        notes: notes || null,
        approvalStatus: "NotRequired",
        createdByUserId: currentUser?.id ?? null,
        items: {
          create: items.map((item) => ({
            itemName: item.itemName,
            quantity: item.quantity,
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
        status: "Unpaid"
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

  await createAuditTrailLog({
    moduleName: "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "CREATED",
    changeSummary: `Sales order ${result.salesOrder.orderNumber} created and invoiced`,
    newValue: {
      orderNumber: result.salesOrder.orderNumber,
      status: result.salesOrder.status,
      total: result.salesOrder.total,
      paymentTermType: result.salesOrder.paymentTermType,
      creditTermMonths: result.salesOrder.creditTermMonths
    }
  });
  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from sales order ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
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
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirect(
    `/invoices?view=${result.invoice.id}&success=${encodeURIComponent(
      "Sales order confirmed and invoice generated"
    )}`
  );
}

export async function generateInvoice(formData: FormData) {
  const currentUser = await getCurrentUser();
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

  if (salesOrder.invoice) {
    redirectWithMessage(
      "/sales-orders",
      "error",
      "This sales order already has an invoice"
    );
  }

  if (!canGenerateInvoiceForApproval(salesOrder.approvalStatus)) {
    redirectWithMessage(
      "/sales-orders?tab=approval",
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
        status: "Unpaid"
      }
    });

    const updatedSalesOrder = await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: { status: "Invoiced" }
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
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated from sales order ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "STATUS_CHANGED",
    changeSummary: `Sales order status changed to ${result.salesOrder.status}`,
    oldValue: { status: salesOrder.status },
    newValue: { status: result.salesOrder.status }
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
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
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirect(`/invoices?view=${result.invoice.id}&success=${encodeURIComponent("Invoice generated")}`);
}

export async function decideSalesOrderApproval(formData: FormData) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "MANAGER") {
    redirectWithMessage(
      "/sales-orders?tab=approval",
      "error",
      "Only a Manager can approve or reject sales orders"
    );
  }

  const salesOrderId = getRequiredString(formData, "salesOrderId");
  const decisionValue = getString(formData, "decision");
  if (decisionValue !== "Approved" && decisionValue !== "Rejected") {
    redirectWithMessage(
      "/sales-orders?tab=approval",
      "error",
      "Choose Approve or Reject for this sales order"
    );
  }
  const decision: SalesOrderApprovalStatus = decisionValue;
  const decisionNote = getString(formData, "decisionNote");
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { invoice: true, customer: true }
  });

  if (!salesOrder) {
    redirectWithMessage("/sales-orders?tab=approval", "error", "Sales order was not found");
  }
  if (salesOrder.approvalStatus !== "Pending") {
    redirectWithMessage(
      "/sales-orders?tab=approval",
      "error",
      "This sales order is no longer waiting for approval"
    );
  }
  if (salesOrder.invoice) {
    redirectWithMessage(
      "/sales-orders?tab=approval",
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
        approvalDecidedById: currentUser.id
      }
    });

    await createAuditTrailLog({
      moduleName: "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: rejectedOrder.id,
      transactionCode: rejectedOrder.orderNumber,
      action: "REJECTED",
      changeSummary: `Manager rejected sales order ${rejectedOrder.orderNumber}`,
      oldValue: { status: salesOrder.status, approvalStatus: salesOrder.approvalStatus },
      newValue: {
        status: rejectedOrder.status,
        approvalStatus: rejectedOrder.approvalStatus,
        decisionNote: rejectedOrder.approvalDecisionNote
      }
    });

    refreshApp();
    redirectWithMessage("/sales-orders?tab=approval", "success", "Sales order rejected");
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
        status: "Unpaid"
      }
    });
    const approvedOrder = await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        status: "Invoiced",
        approvalStatus: "Approved",
        approvalDecisionNote: decisionNote || null,
        approvalDecidedAt: issueDate,
        approvalDecidedById: currentUser.id
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
    moduleName: "Sales Orders",
    entityType: "SALES_ORDER",
    entityId: result.salesOrder.id,
    transactionCode: result.salesOrder.orderNumber,
    action: "APPROVED",
    changeSummary: `Manager approved sales order ${result.salesOrder.orderNumber}`,
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
    changeSummary: `Invoice ${result.invoice.invoiceNumber} generated after Manager approval of ${result.salesOrder.orderNumber}`,
    newValue: summarizeInvoice(result.invoice)
  });
  await createAuditTrailLog({
    moduleName: "Receivables",
    entityType: "RECEIVABLE",
    entityId: result.invoice.id,
    transactionCode: result.invoice.invoiceNumber,
    action: "CREATED",
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
      changeSummary: `Credit billing reminder created for invoice ${result.invoice.invoiceNumber}`,
      newValue: summarizeFollowUp(result.followUp)
    });
  }

  refreshApp();
  redirectWithMessage(
    "/sales-orders?tab=approval",
    "success",
    "Sales order approved and invoice generated"
  );
}

export async function recordPayment(formData: FormData) {
  const currentUser = await getCurrentUser();
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
        notes: getString(formData, "notes") || null
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
  const id = getRequiredString(formData, "id");

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
      notes: getString(formData, "notes") || null
    }
  });

  await createAuditTrailLog({
    moduleName: "Invoices",
    entityType: "INVOICE",
    entityId: invoice.id,
    transactionCode: invoice.invoiceNumber,
    action: "NOTE_UPDATED",
    changeSummary: `Invoice notes updated for ${invoice.invoiceNumber}`,
    oldValue: { notes: oldInvoice.notes },
    newValue: { notes: invoice.notes }
  });

  refreshApp();
  redirect(`/invoices?view=${id}&success=${encodeURIComponent("Invoice notes updated")}`);
}

export async function createFollowUp(formData: FormData) {
  const customerId = getRequiredString(formData, "customerId");
  const invoiceId = getString(formData, "invoiceId");
  const followUpDate = new Date(getRequiredString(formData, "followUpDate"));
  const notes = getRequiredString(formData, "notes");

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
      notes
    },
    include: { customer: true, invoice: true }
  });

  await createAuditTrailLog({
    moduleName: "Billing",
    entityType: "FOLLOW_UP",
    entityId: followUp.id,
    transactionCode: followUp.invoice?.invoiceNumber ?? followUp.customer.companyName ?? followUp.id,
    action: "CREATED",
    changeSummary: `Billing record created for ${followUp.invoice?.invoiceNumber ?? followUp.customer.companyName}`,
    newValue: summarizeFollowUp(followUp)
  });

  refreshApp();
  redirectWithMessage("/billing", "success", "Billing record added");
}

export async function recordCustomerProductFollowUp(formData: FormData) {
  const customerId = getRequiredString(formData, "customerId");
  const contactDateValue = getRequiredString(formData, "contactDate");
  const contactDate = new Date(`${contactDateValue}T00:00:00`);

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
      notes: getString(formData, "notes") || null
    }
  });

  await createAuditTrailLog({
    moduleName: "Follow Up",
    entityType: "CUSTOMER_PRODUCT_FOLLOW_UP",
    entityId: productFollowUp.id,
    transactionCode: customer.companyName || customer.name,
    action: "CONTACT_RECORDED",
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
  const currentUser = await getCurrentUser();
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
      notes: getString(formData, "notes") || null,
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
  const id = getRequiredString(formData, "id");
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
    select: { id: true, deliveryNoteNumber: true, status: true }
  });

  if (!oldDeliveryNote) {
    redirectWithMessage("/surat-jalan", "error", "Surat Jalan was not found");
  }

  const deliveryNote = await prisma.deliveryNote.update({
    where: { id },
    data: { status }
  });

  await createAuditTrailLog({
    moduleName: "Surat Jalan",
    entityType: "DELIVERY_NOTE",
    entityId: deliveryNote.id,
    transactionCode: deliveryNote.deliveryNoteNumber,
    action: deliveryNote.status === "Delivered" ? "DELIVERED" : "STATUS_CHANGED",
    changeSummary: `Surat Jalan status changed from ${oldDeliveryNote.status} to ${deliveryNote.status}`,
    oldValue: { status: oldDeliveryNote.status },
    newValue: { status: deliveryNote.status }
  });

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
  const count = await prisma.deliveryNote.count();
  return `SJ-${year}-${String(count + 1).padStart(3, "0")}`;
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function getRequiredString(formData: FormData, name: string) {
  return getString(formData, name);
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
