"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuditTrailLog } from "@/lib/audit";
import {
  canCreatePickingList,
  isPickingComplete,
  validatePickingQuantities,
} from "@/lib/picking-list";
import { prisma } from "@/lib/prisma";
import { canRole } from "@/lib/role-access";
import { requireCurrentUser } from "@/lib/session";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fail(message: string, pickingListId?: string): never {
  const query = new URLSearchParams({ tab: "picking", error: message });
  if (pickingListId) query.set("viewPicking", pickingListId);
  redirect(`/surat-jalan?${query.toString()}`);
}

function refreshPickingViews() {
  for (const path of [
    "/",
    "/surat-jalan",
    "/sales-orders",
    "/customer-purchase-orders",
    "/invoices",
    "/payments",
    "/audit-trail",
  ]) {
    revalidatePath(path);
  }
}

export async function createPickingList(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canRole(user.role, "CREATE_SURAT_JALAN"))
    fail("Only Admin and Manager can create Picking Lists");

  const salesOrderId = getText(formData, "salesOrderId");
  if (!salesOrderId) fail("Select a Sales Order or Customer PO");

  const order = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      items: true,
      invoice: { include: { deliveryNotes: { select: { id: true } } } },
      deliveryNotes: { select: { id: true } },
      deliverySources: { select: { id: true } },
      pickingList: { select: { id: true } },
    },
  });
  if (
    !order ||
    !canCreatePickingList({
      status: order.status,
      approvalStatus: order.approvalStatus,
      invoice: order.invoice,
      hasPickingList: Boolean(order.pickingList),
      deliveryNoteCount: new Set([
        ...(order.deliverySources ?? []).map(source => source.id),
        ...order.deliveryNotes.map((note) => note.id),
        ...(order.invoice?.deliveryNotes.map((note) => note.id) ?? []),
      ]).size,
    }) ||
    order.items.length === 0
  ) {
    fail(
      "This order is not ready for a Picking List or already has a delivery process",
    );
  }

  let pickingList;
  try {
    pickingList = await prisma.pickingList.create({
      data: {
        pickingListNumber: `PL-${order.orderNumber}`,
        salesOrderId: order.id,
        items: {
          create: order.items.map((item) => ({
            salesOrderItemId: item.id,
            itemName: item.itemName,
            orderedQuantity: item.quantity,
          })),
        },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      fail(
        "A Picking List was already created for this order. Refresh the queue.",
      );
    }
    throw error;
  }

  await createAuditTrailLog({
    moduleName: "Picking List & Surat Jalan",
    entityType: "PICKING_LIST",
    actionNote: getText(formData, "confirmationNote"),
    entityId: pickingList.id,
    recordReference: pickingList.pickingListNumber,
    action: "CREATED",
    changeSummary: `Picking List created from ${order.orderNumber}`,
    newValue: { salesOrderId: order.id, itemCount: order.items.length },
  });
  refreshPickingViews();
  redirect(
    `/surat-jalan?tab=picking&viewPicking=${pickingList.id}&success=${encodeURIComponent("Picking List created")}`,
  );
}

export async function savePickingList(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canRole(user.role, "CREATE_SURAT_JALAN"))
    fail("Only Admin and Manager can update Picking Lists");

  const id = getText(formData, "id");
  const intent = getText(formData, "intent");
  if (!id || !["save", "complete"].includes(intent))
    fail("Invalid Picking List action");

  const pickingList = await prisma.pickingList.findUnique({
    where: { id },
    include: { items: true, deliveryNote: { select: { id: true } }, deliverySource: true },
  });
  if (
    !pickingList ||
    pickingList.deliveryNote || pickingList.deliverySource ||
    pickingList.status === "Packed"
  ) {
    fail("This Picking List can no longer be edited", id);
  }

  if (getText(formData, "version") !== pickingList.updatedAt.toISOString()) {
    fail(
      "This Picking List changed. Review the latest quantities and try again.",
      id,
    );
  }

  const items = pickingList.items.map((item) => ({
    id: item.id,
    orderedQuantity: item.orderedQuantity,
    pickedQuantity: /^\d+$/.test(getText(formData, `picked_${item.id}`))
      ? Number(getText(formData, `picked_${item.id}`))
      : NaN,
    packedQuantity: /^\d+$/.test(getText(formData, `packed_${item.id}`))
      ? Number(getText(formData, `packed_${item.id}`))
      : NaN,
    notes: getText(formData, `notes_${item.id}`) || null,
  }));
  if (!validatePickingQuantities(items)) {
    fail(
      "Each picked and packed quantity must be between zero and the ordered quantity; packed cannot exceed picked",
      id,
    );
  }

  const pickerName = getText(formData, "pickerName") || null;
  const packerName = getText(formData, "packerName") || null;
  const rawPackageCount = getText(formData, "packageCount");
  const packageCount = rawPackageCount ? Number(rawPackageCount) : null;
  if (
    packageCount !== null &&
    (!Number.isSafeInteger(packageCount) ||
      packageCount < 1 ||
      packageCount > 2147483647)
  ) {
    fail("Package count must be a positive whole number", id);
  }
  if (
    intent === "complete" &&
    (!isPickingComplete(items) || !pickerName || !packerName || !packageCount)
  ) {
    fail(
      "All items must be fully picked and packed, with picker, packer, and package count recorded",
      id,
    );
  }

  const hasProgress = items.some(
    (item) => item.pickedQuantity > 0 || item.packedQuantity > 0,
  );
  const status =
    intent === "complete" ? "Packed" : hasProgress ? "InProgress" : "Pending";
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.pickingList.updateMany({
        where: {
          id,
          updatedAt: pickingList.updatedAt,
          status: { in: ["Pending", "InProgress"] },
          deliveryNote: { is: null },
          deliverySource: { is: null },
        },
        data: {
          status,
          pickerName,
          packerName,
          packageCount,
          notes: getText(formData, "notes") || null,
          packedAt: intent === "complete" ? new Date() : null,
        },
      });
      if (updated.count !== 1) throw new Error("PICKING_SAVE_CONFLICT");
      for (const item of items) {
        await tx.pickingListItem.update({
          where: { id: item.id },
          data: {
            pickedQuantity: item.pickedQuantity,
            packedQuantity: item.packedQuantity,
            notes: item.notes,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PICKING_SAVE_CONFLICT") {
      fail(
        "This Picking List changed. Review the latest quantities and try again.",
        id,
      );
    }
    throw error;
  }

  await createAuditTrailLog({
    moduleName: "Picking List & Surat Jalan",
    entityType: "PICKING_LIST",
    actionNote: getText(formData, "confirmationNote"),
    entityId: id,
    recordReference: pickingList.pickingListNumber,
    action: intent === "complete" ? "PACKED" : "UPDATED",
    changeSummary:
      intent === "complete"
        ? "Picking and packing completed"
        : "Picking progress saved",
    oldValue: {
      status: pickingList.status,
      items: pickingList.items.map(
        ({ id, pickedQuantity, packedQuantity }) => ({
          id,
          pickedQuantity,
          packedQuantity,
        }),
      ),
    },
    newValue: { status, pickerName, packerName, packageCount, items },
  });
  refreshPickingViews();
  redirect(
    `/surat-jalan?tab=picking&viewPicking=${id}&success=${encodeURIComponent(intent === "complete" ? "Picking List marked Packed" : "Picking progress saved")}`,
  );
}
