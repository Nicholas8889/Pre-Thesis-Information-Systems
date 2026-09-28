import "server-only";

import { prisma } from "@/lib/prisma";
import { getApprovalReasonLabel } from "@/lib/sales-order-approval";
import {
  CUSTOMER_OUTREACH_ELIGIBLE_ORDER_STATUSES,
  CUSTOMER_PO_NOTIFICATION_ACTIVE_STATUSES,
  isCollectionDeadlineNotification,
  isCustomerPoProcessingNotification,
  needsCustomerOutreach
} from "@/lib/notification-rules";
import { buildPortfolioScope, type PortfolioUser } from "@/lib/portfolio-scope";
import {
  addBusinessDaysWib,
  getBusinessDateWib,
  subtractBusinessMonthsWib,
  type Clock,
  systemClock,
} from "@/lib/business-clock";

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  sentAt: string;
  href: string;
};

export async function getRoleNotifications(
  user: PortfolioUser,
  clock: Clock = systemClock,
) {
  const now = clock.now();
  const roleNotificationsPromise =
    user.role === "ADMIN"
      ? getAdminCollectionsNotifications(user, now)
      : user.role === "SALES"
        ? getSalesOutreachNotifications(user, now)
        : user.role === "MANAGER"
          ? getManagerApprovalNotifications(user)
          : Promise.resolve([]);
  const [roleNotifications, customerPoNotifications] = await Promise.all([
    roleNotificationsPromise,
    getCustomerPoNotifications(user, now)
  ]);
  return [...customerPoNotifications, ...roleNotifications].slice(0, 12);
}

async function getCustomerPoNotifications(
  user: PortfolioUser,
  now: Date,
): Promise<AppNotification[]> {
  const today = getBusinessDateWib(now);
  const deadlineLimit = addBusinessDaysWib(today, 7);
  const portfolio = buildPortfolioScope(user);
  const customerPos = await prisma.salesOrder.findMany({
    where: {
      ...portfolio.salesOrderWhere,
      source: "CUSTOMER_PO",
      requiredDate: { not: null, lte: deadlineLimit },
      status: { in: [...CUSTOMER_PO_NOTIFICATION_ACTIVE_STATUSES] },
      deliveryNotes: { none: { status: "Delivered" } },
      deliverySources: {
        none: { deliveryNote: { is: { status: "Delivered" } } },
      },
    },
    orderBy: [{ requiredDate: "asc" }, { id: "asc" }],
    take: 50,
    include: {
      customer: true,
      deliveryNotes: { select: { status: true } },
      deliverySources: { select: { deliveryNote: { select: { status: true } } } }
    }
  });

  return customerPos
    .filter((order) =>
      isCustomerPoProcessingNotification(
        {
          requiredDate: order.requiredDate,
          status: order.status,
          hasDeliveredDocument: (order.deliverySources ?? []).some(source => source.deliveryNote.status === "Delivered") || order.deliveryNotes.some(
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
        id: `customer-po-processing:${order.id}`,
        title: isOverdue ? "Customer PO processing overdue" : "Customer PO date is approaching",
        description: `${order.orderNumber} · ${order.customer.companyName} · Required ${formatShortDate(requiredDate)}`,
        sentAt: now.toISOString(),
        href: `/customer-purchase-orders/${order.id}`
      };
    });
}

async function getManagerApprovalNotifications(
  user: PortfolioUser,
): Promise<AppNotification[]> {
  const portfolio = buildPortfolioScope(user);
  const pendingOrders = await prisma.salesOrder.findMany({
    where: { ...portfolio.salesOrderWhere, approvalStatus: "Pending" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 12,
    include: { customer: true }
  });

  return pendingOrders.map((order) => ({
    id: `sales-order-approval-${order.id}`,
    title:
      order.source === "CUSTOMER_PO"
        ? "Customer PO approval needed"
        : "Sales order approval needed",
    description: `${order.orderNumber} · ${order.customer.companyName} · ${getApprovalReasonLabel(order.approvalRisk)}`,
    sentAt: order.createdAt.toISOString(),
    href: `${
      order.source === "CUSTOMER_PO" ? "/customer-purchase-orders" : "/sales-orders"
    }?tab=approval&view=${order.id}`
  }));
}

async function getAdminCollectionsNotifications(
  user: PortfolioUser,
  now: Date,
): Promise<AppNotification[]> {
  const today = getBusinessDateWib(now);
  const deadlineLimit = addBusinessDaysWib(today, 7);
  const portfolio = buildPortfolioScope(user);
  const collectionTasks = await prisma.collectionTask.findMany({
    where: {
      ...portfolio.collectionTaskWhere,
      status: "Planned",
      scheduledDate: { lte: deadlineLimit },
      OR: [
        { invoiceId: null },
        { invoice: { status: { not: "Cancelled" }, remainingAmount: { gt: 0 } } }
      ]
    },
    orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
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
      id: `collection-deadline:${task.id}`,
      title: isOverdue ? "Collection task overdue" : "Collection deadline is near",
      description: `${task.customer.companyName} · ${invoiceLabel} · Due ${formatShortDate(task.scheduledDate)}`,
      sentAt: now.toISOString(),
      href: `/collections?customerId=${task.customerId}${task.invoiceId ? `&invoiceId=${task.invoiceId}` : ""}`
    };
  });
}

async function getSalesOutreachNotifications(
  user: PortfolioUser,
  now: Date,
): Promise<AppNotification[]> {
  const today = getBusinessDateWib(now);
  const inactivityThreshold = subtractBusinessMonthsWib(today, 3);
  const portfolio = buildPortfolioScope(user);
  const customers = await prisma.customer.findMany({
    where: {
      status: "Active",
      ...portfolio.customerWhere,
      salesOrders: {
        none: {
          status: { in: [...CUSTOMER_OUTREACH_ELIGIBLE_ORDER_STATUSES] },
          orderDate: { gt: inactivityThreshold },
        },
      },
    },
    orderBy: { companyName: "asc" },
    take: 12,
    include: {
      salesOrders: {
        where: { status: { in: [...CUSTOMER_OUTREACH_ELIGIBLE_ORDER_STATUSES] } },
        orderBy: [{ orderDate: "desc" }, { id: "desc" }],
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
        id: `customer-inactivity:${customer.id}`,
        title: "Customer outreach needed",
        description: latestOrder
          ? `${customer.companyName} has not placed an order since ${formatShortDate(latestOrder)}.`
          : `${customer.companyName} has not placed an order yet.`,
        sentAt: now.toISOString(),
        href: `/customer-outreach?customerId=${customer.id}#record-outreach`
      };
    });
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}
