"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ActionNoteValidationError,
  normalizeActionNote
} from "@/lib/action-notes";
import { createAuditTrailLog } from "@/lib/audit";
import {
  canCreatePickingList,
  getPickingTotals,
  isPickingComplete,
  validatePickingQuantities,
} from "@/lib/picking-list";
import { prisma } from "@/lib/prisma";
import { parseExactPickingItems } from "@/lib/picking-item-payload";
import { canRole } from "@/lib/role-access";
import { requireCurrentUser } from "@/lib/session";
import { parsePackageCount } from "@/lib/package-count";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function fail(
  message: string,
  pickingListId?: string,
  tab: "active" | "completed" = "active",
): never {
  const query = new URLSearchParams({ tab, error: message });
  if (pickingListId) query.set("view", pickingListId);
  redirect(`/pick-pack?${query.toString()}`);
}

function refreshPickingViews() {
  for (const path of [
    "/",
    "/pick-pack",
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
  const pickerName = getText(formData, "pickerName");
  if (!salesOrderId) fail("Select a Sales Order or Customer PO");
  if (!pickerName) fail("Picking PIC is required");

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
    pickingList = await prisma.$transaction(async tx => {
      const created = await tx.pickingList.create({
        data: {
          pickingListNumber: `PL-${order.orderNumber}`,
          salesOrderId: order.id,
          pickerName,
          items: {
            create: order.items.map((item) => ({
              salesOrderItemId: item.id,
              itemName: item.itemName,
              orderedQuantity: item.quantity,
              availableQuantity: 0,
              packedQuantity: 0,
              availabilityStatus: "Unchecked",
            })),
          },
        },
      });
      await createAuditTrailLog({
        actor: user,
        moduleName: "Pick & Pack",
        entityType: "PICKING_LIST",
        actionNote: getText(formData, "confirmationNote"),
        entityId: created.id,
        recordReference: created.pickingListNumber,
        action: "CREATED",
        changeSummary: `Picking List created from ${order.orderNumber}`,
        newValue: {
          salesOrderId: order.id,
          pickerName,
          itemCount: order.items.length,
        },
      }, { transaction: tx });
      return created;
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

  refreshPickingViews();
  redirect(
    `/pick-pack?tab=active&view=${pickingList.id}&success=${encodeURIComponent("Picking List created")}`,
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
  const packageCountResult = parsePackageCount(formData.get("packageCount"), {
    required: intent === "complete"
  });
  if (!packageCountResult.valid) {
    fail(
      intent === "complete"
        ? "Package count is required and must be a positive whole number"
        : "Package count must be blank or a positive whole number",
      id
    );
  }

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

  const items = parseExactPickingItems(formData, pickingList.items);
  if (!items || !validatePickingQuantities(items)) {
    fail(
      "Submit every Picking List item exactly once with consistent availability and quantities",
      id,
    );
  }

  const pickerName = getText(formData, "pickerName") || pickingList.pickerName;
  const packerName = getText(formData, "packerName") || null;
  if (intent === "complete" && (!isPickingComplete(items) || !pickerName || !packerName)) {
    fail(
      "Review every item, pack all available stock, record Picking and Packing PIC, and explain every shortage",
      id,
    );
  }

  const totals = getPickingTotals(items);
  const status = intent === "complete" ? "Packed" : "InProgress";
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
          packageCount: intent === "complete" ? packageCountResult.value : null,
          notes: getText(formData, "notes") || null,
          packedAt: intent === "complete" ? new Date() : null,
        },
      });
      if (updated.count !== 1) throw new Error("PICKING_SAVE_CONFLICT");
      for (const item of items) {
        await tx.pickingListItem.update({
          where: { id: item.id },
          data: {
            availableQuantity: item.availableQuantity,
            packedQuantity: item.packedQuantity,
            availabilityStatus: item.availabilityStatus,
            notes: item.notes,
          },
        });
      }
      await createAuditTrailLog({
        actor: user,
        moduleName: "Pick & Pack",
        entityType: "PICKING_LIST",
        actionNote: getText(formData, "confirmationNote"),
        entityId: id,
        recordReference: pickingList.pickingListNumber,
        action: intent === "complete" ? "PACKED" : "UPDATED",
        changeSummary:
          intent === "complete"
            ? `Pick & Pack completed with ${totals.shortage} shortage unit(s)`
            : "Pick & Pack progress saved",
        oldValue: {
          status: pickingList.status,
          items: pickingList.items.map(
            ({ id, availableQuantity, packedQuantity, availabilityStatus }) => ({
              id,
              availableQuantity,
              packedQuantity,
              availabilityStatus,
            }),
          ),
        },
        newValue: {
          status,
          pickerName,
          packerName,
          packageCount: intent === "complete" ? packageCountResult.value : null,
          shortageQuantity: totals.shortage,
          items,
        },
      }, { transaction: tx });
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

  refreshPickingViews();
  redirect(
    `/pick-pack?tab=${intent === "complete" ? "completed" : "active"}&view=${id}&success=${encodeURIComponent(intent === "complete" ? "Pick & Pack completed" : "Pick & Pack progress saved")}`,
  );
}

export async function reopenPickingList(formData: FormData) {
  const user = await requireCurrentUser();
  if (!canRole(user.role, "CREATE_SURAT_JALAN")) {
    fail("Only Admin and Manager can reopen Picking Lists", undefined, "completed");
  }

  const id = getText(formData, "id");
  if (!id) fail("Invalid Picking List action", undefined, "completed");
  let actionNote: string;
  try {
    actionNote = normalizeActionNote(
      getText(formData, "confirmationNote"),
      "required"
    );
  } catch (error) {
    if (error instanceof ActionNoteValidationError) {
      fail(error.message, id, "completed");
    }
    throw error;
  }

  const pickingList = await prisma.pickingList.findUnique({
    where: { id },
    include: {
      deliveryNote: { select: { id: true } },
      deliverySource: { select: { id: true } },
    },
  });
  if (!pickingList || pickingList.status !== "Packed") {
    fail("Only completed Picking Lists can be reopened", id, "completed");
  }
  if (pickingList.deliveryNote || pickingList.deliverySource) {
    fail(
      "Picking Lists linked to Surat Jalan cannot be reopened",
      id,
      "completed",
    );
  }
  if (getText(formData, "version") !== pickingList.updatedAt.toISOString()) {
    fail(
      "This Picking List changed. Review the latest status and try again.",
      id,
      "completed",
    );
  }

  await prisma.$transaction(async tx => {
    const updated = await tx.pickingList.updateMany({
      where: {
        id,
        updatedAt: pickingList.updatedAt,
        status: "Packed",
        deliveryNote: { is: null },
        deliverySource: { is: null },
      },
      data: {
        status: "InProgress",
        packerName: null,
        packageCount: null,
        packedAt: null
      },
    });
    if (updated.count !== 1) throw new Error("PICKING_REOPEN_CONFLICT");
    await createAuditTrailLog({
      actor: user,
      moduleName: "Pick & Pack",
      entityType: "PICKING_LIST",
      actionNote,
      entityId: id,
      recordReference: pickingList.pickingListNumber,
      action: "REOPENED",
      changeSummary: "Completed Picking List reopened for correction",
      oldValue: {
        status: pickingList.status,
        packageCount: pickingList.packageCount,
        packedAt: pickingList.packedAt
      },
      newValue: { status: "InProgress", packageCount: null, packedAt: null },
    }, { transaction: tx });
  }).catch(error => {
    if (error instanceof Error && error.message === "PICKING_REOPEN_CONFLICT") {
      fail(
        "This Picking List changed. Review the latest status and try again.",
        id,
        "completed",
      );
    }
    throw error;
  });
  refreshPickingViews();
  redirect(
    `/pick-pack?tab=active&view=${id}&success=${encodeURIComponent("Picking List reopened")}`,
  );
}
