import "server-only";
import { Prisma, type UserRole } from "@prisma/client";
import { buildPortfolioScope } from "@/lib/portfolio-scope";
import { getOrderItemEditEligibility, type OrderItemEditActor } from "@/lib/order-item-edit-policy";
import { prisma } from "@/lib/prisma";

export const orderItemEditInclude = {
  customer: { select: { status: true } },
  items: { orderBy: { id: "asc" as const } },
  invoice: { include: { _count: { select: { payments: true, deliveryNotes: true, deliverySources: true } } } },
  pickingList: { include: {
    items: { orderBy: { id: "asc" as const }, include: { deliveryNoteItem: { select: { id: true } } } },
    deliveryNote: { select: { id: true } }, deliverySource: { select: { id: true } },
  } },
  _count: { select: { deliveryNotes: true, deliverySources: true } },
} satisfies Prisma.SalesOrderInclude;

export type OrderItemEditRecord = Prisma.SalesOrderGetPayload<{ include: typeof orderItemEditInclude }>;
export class OrderItemEditError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "OrderItemEditError"; }
}

export async function loadOrderItemEditContext(
  id: string, actor: OrderItemEditActor,
  client: Pick<Prisma.TransactionClient, "salesOrder"> = prisma,
) {
  const access = getOrderItemEditEligibility(actor, null);
  if (access.code === "ROLE_DENIED") throw new OrderItemEditError(access.code, access.message);
  const scope = buildPortfolioScope({ id: actor.id, role: actor.role as UserRole });
  const order = await client.salesOrder.findFirst({
    where: { id, ...scope.salesOrderWhere }, include: orderItemEditInclude,
  });
  return { order, eligibility: getOrderItemEditEligibility(actor, order) };
}

// Shared future write gate. Parent -> invoice -> sheet ordering serializes
// item revisions with invoice/payment operations and warehouse transitions.
export async function lockOrderItemEditContext(
  tx: Prisma.TransactionClient, id: string, actor: OrderItemEditActor, expectedVersion: number,
) {
  const access = getOrderItemEditEligibility(actor, null);
  if (access.code === "ROLE_DENIED") throw new OrderItemEditError(access.code, access.message);
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM sales_orders WHERE id = ${id}
    ${actor.role === "SALES" ? Prisma.sql`AND created_by_user_id = ${actor.id}` : Prisma.empty}
    FOR UPDATE
  `);
  if (!rows.length) throw new OrderItemEditError("NOT_FOUND", "Transaction was not found or is outside your portfolio.");
  await tx.$queryRaw`SELECT id FROM invoices WHERE sales_order_id = ${id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM picking_lists WHERE sales_order_id = ${id} FOR UPDATE`;
  const { order, eligibility } = await loadOrderItemEditContext(id, actor, tx);
  if (!eligibility.allowed || !order) throw new OrderItemEditError(eligibility.code, eligibility.message);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || order.version !== expectedVersion) {
    throw new OrderItemEditError("STALE_VERSION", "The transaction changed. Reload it before editing items.");
  }
  return order;
}
