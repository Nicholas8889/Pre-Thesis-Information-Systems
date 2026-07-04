import "server-only";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isBillingDeadlineNotification,
  isPreOrderProcessingNotification,
  needsSalesCustomerFollowUp
} from "@/lib/notification-rules";

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  sentAt: string;
  href: string;
};

export async function getRoleNotifications(user: { role: UserRole }) {
  const roleNotifications =
    user.role === "ADMIN"
      ? await getAdminBillingNotifications()
      : user.role === "SALES"
        ? await getSalesFollowUpNotifications()
        : user.role === "MANAGER"
          ? await getManagerApprovalNotifications()
          : [];
  const preOrderNotifications = await getPreOrderNotifications();
  return [...preOrderNotifications, ...roleNotifications].slice(0, 12);
}

async function getPreOrderNotifications(): Promise<AppNotification[]> {
  const today = startOfDay(new Date());
  const preOrders = await prisma.salesOrder.findMany({
    where: {
      transactionType: "PRE_ORDER",
      requiredDate: { not: null },
      status: { not: "Cancelled" }
    },
    orderBy: { requiredDate: "asc" },
    take: 50,
    include: {
      customer: true,
      deliveryNotes: { select: { status: true } }
    }
  });

  return preOrders
    .filter((order) =>
      isPreOrderProcessingNotification(
        {
          requiredDate: order.requiredDate,
          status: order.status,
          hasDeliveredDocument: order.deliveryNotes.some(
            (deliveryNote) => deliveryNote.status === "Delivered"
          )
        },
        today
      )
    )
    .slice(0, 12)
    .map((order) => {
      const requiredDate = order.requiredDate as Date;
      const isOverdue = requiredDate < today;
      return {
        id: `pre-order-${order.id}-${requiredDate.toISOString().slice(0, 10)}`,
        title: isOverdue ? "Pre Order processing overdue" : "Pre Order date is approaching",
        description: `${order.orderNumber} · ${order.customer.companyName} · Required ${formatShortDate(requiredDate)}`,
        sentAt: new Date().toISOString(),
        href: `/pre-orders/${order.id}`
      };
    });
}

async function getManagerApprovalNotifications(): Promise<AppNotification[]> {
  const pendingOrders = await prisma.salesOrder.findMany({
    where: { approvalStatus: "Pending" },
    orderBy: { createdAt: "asc" },
    take: 12,
    include: { customer: true }
  });

  return pendingOrders.map((order) => ({
    id: `sales-order-approval-${order.id}`,
    title:
      order.transactionType === "PRE_ORDER"
        ? "Pre Order approval needed"
        : "Sales order approval needed",
    description: `${order.orderNumber} · ${order.customer.companyName} · ${order.approvalRisk ?? "Payment risk"}`,
    sentAt: order.createdAt.toISOString(),
    href: `${
      order.transactionType === "PRE_ORDER" ? "/pre-orders" : "/sales-orders"
    }?tab=approval&view=${order.id}`
  }));
}

async function getAdminBillingNotifications(): Promise<AppNotification[]> {
  const today = startOfDay(new Date());
  const billingTasks = await prisma.followUp.findMany({
    where: {
      status: "Planned"
    },
    orderBy: { followUpDate: "asc" },
    take: 12,
    include: { customer: true, invoice: true }
  });

  return billingTasks.filter((task) =>
    isBillingDeadlineNotification(
      { status: task.status, deadline: task.followUpDate },
      today
    )
  ).map((task) => {
    const isOverdue = task.followUpDate < today;
    const invoiceLabel = task.invoice?.invoiceNumber ?? "customer billing";
    return {
      id: `billing-${task.id}-${task.followUpDate.toISOString().slice(0, 10)}`,
      title: isOverdue ? "Billing task overdue" : "Billing deadline is near",
      description: `${task.customer.companyName} · ${invoiceLabel} · Due ${formatShortDate(task.followUpDate)}`,
      sentAt: new Date().toISOString(),
      href: `/billing?customerId=${task.customerId}${task.invoiceId ? `&invoiceId=${task.invoiceId}` : ""}`
    };
  });
}

async function getSalesFollowUpNotifications(): Promise<AppNotification[]> {
  const today = new Date();
  const customers = await prisma.customer.findMany({
    where: { status: "Active" },
    orderBy: { companyName: "asc" },
    include: {
      salesOrders: {
        orderBy: { orderDate: "desc" },
        take: 1,
        select: { orderDate: true }
      }
    }
  });

  return customers
    .filter((customer) => {
      const latestOrder = customer.salesOrders[0];
      return needsSalesCustomerFollowUp(latestOrder?.orderDate ?? null, today);
    })
    .slice(0, 12)
    .map((customer) => {
      const latestOrder = customer.salesOrders[0]?.orderDate;
      return {
        id: `sales-follow-up-${customer.id}-${latestOrder?.toISOString().slice(0, 10) ?? "never"}`,
        title: "Customer follow up needed",
        description: latestOrder
          ? `${customer.companyName} has not made a transaction since ${formatShortDate(latestOrder)}.`
          : `${customer.companyName} has not made a transaction yet.`,
        sentAt: today.toISOString(),
        href: `/follow-ups?customerId=${customer.id}#record-follow-up`
      };
    });
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
