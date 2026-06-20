import "server-only";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isBillingDeadlineNotification,
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
  if (user.role === "ADMIN") return getAdminBillingNotifications();
  if (user.role === "SALES") return getSalesFollowUpNotifications();
  if (user.role === "MANAGER") return getManagerApprovalNotifications();
  return [];
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
    title: "Sales order approval needed",
    description: `${order.orderNumber} · ${order.customer.companyName} · ${order.approvalRisk ?? "Payment risk"}`,
    sentAt: order.createdAt.toISOString(),
    href: `/sales-orders?tab=approval&view=${order.id}`
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
