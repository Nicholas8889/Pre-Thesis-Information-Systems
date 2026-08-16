import "server-only";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isCollectionDeadlineNotification,
  isCustomerPoProcessingNotification,
  needsCustomerOutreach
} from "@/lib/notification-rules";

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  sentAt: string;
  href: string;
};

export async function getRoleNotifications(user: { role: UserRole }) {
  const roleNotificationsPromise =
    user.role === "ADMIN"
      ? getAdminCollectionsNotifications()
      : user.role === "SALES"
        ? getSalesOutreachNotifications()
        : user.role === "MANAGER"
          ? getManagerApprovalNotifications()
          : Promise.resolve([]);
  const [roleNotifications, customerPoNotifications] = await Promise.all([
    roleNotificationsPromise,
    getCustomerPoNotifications()
  ]);
  return [...customerPoNotifications, ...roleNotifications].slice(0, 12);
}

async function getCustomerPoNotifications(): Promise<AppNotification[]> {
  const today = startOfDay(new Date());
  const customerPos = await prisma.salesOrder.findMany({
    where: {
      source: "CUSTOMER_PO",
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

  return customerPos
    .filter((order) =>
      isCustomerPoProcessingNotification(
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
        id: `customer-po-${order.id}-${requiredDate.toISOString().slice(0, 10)}`,
        title: isOverdue ? "Customer PO processing overdue" : "Customer PO date is approaching",
        description: `${order.orderNumber} · ${order.customer.companyName} · Required ${formatShortDate(requiredDate)}`,
        sentAt: new Date().toISOString(),
        href: `/customer-purchase-orders/${order.id}`
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
      order.source === "CUSTOMER_PO"
        ? "Customer PO approval needed"
        : "Sales order approval needed",
    description: `${order.orderNumber} · ${order.customer.companyName} · ${order.approvalRisk ?? "Payment risk"}`,
    sentAt: order.createdAt.toISOString(),
    href: `${
      order.source === "CUSTOMER_PO" ? "/customer-purchase-orders" : "/sales-orders"
    }?tab=approval&view=${order.id}`
  }));
}

async function getAdminCollectionsNotifications(): Promise<AppNotification[]> {
  const today = startOfDay(new Date());
  const collectionTasks = await prisma.collectionTask.findMany({
    where: {
      status: "Planned"
    },
    orderBy: { scheduledDate: "asc" },
    take: 12,
    include: { customer: true, invoice: true }
  });

  return collectionTasks.filter((task) =>
    isCollectionDeadlineNotification(
      { status: task.status, deadline: task.scheduledDate },
      today
    )
  ).map((task) => {
    const isOverdue = task.scheduledDate < today;
    const invoiceLabel = task.invoice?.invoiceNumber ?? "customer collection";
    return {
      id: `collection-task-${task.id}-${task.scheduledDate.toISOString().slice(0, 10)}`,
      title: isOverdue ? "Collection task overdue" : "Collection deadline is near",
      description: `${task.customer.companyName} · ${invoiceLabel} · Due ${formatShortDate(task.scheduledDate)}`,
      sentAt: new Date().toISOString(),
      href: `/collections?customerId=${task.customerId}${task.invoiceId ? `&invoiceId=${task.invoiceId}` : ""}`
    };
  });
}

async function getSalesOutreachNotifications(): Promise<AppNotification[]> {
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
      return needsCustomerOutreach(latestOrder?.orderDate ?? null, today);
    })
    .slice(0, 12)
    .map((customer) => {
      const latestOrder = customer.salesOrders[0]?.orderDate;
      return {
        id: `customer-outreach-${customer.id}-${latestOrder?.toISOString().slice(0, 10) ?? "never"}`,
        title: "Customer outreach needed",
        description: latestOrder
          ? `${customer.companyName} has not placed an order since ${formatShortDate(latestOrder)}.`
          : `${customer.companyName} has not placed an order yet.`,
        sentAt: today.toISOString(),
        href: `/customer-outreach?customerId=${customer.id}#record-outreach`
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
