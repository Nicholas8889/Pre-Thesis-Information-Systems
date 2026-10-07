"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ActionNoteValidationError } from "@/lib/action-notes";
import { OrderItemEditError } from "@/lib/order-item-edit-context";
import { applyOrderItemEdit, previewOrderItemEdit } from "@/lib/order-item-edit-service";

function invalidPayload(): never { throw new OrderItemEditError("INVALID_PAYLOAD", "Submit only the item-edit form fields."); }
function previewRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidPayload();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["id", "expectedVersion", "items"].includes(key)) ||
      typeof input.id !== "string" || !input.id.trim() || input.id.length > 128 ||
      !Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) return invalidPayload();
  return { id: input.id.trim(), expectedVersion: input.expectedVersion as number, items: input.items };
}
function singleText(data: FormData, name: string) {
  const values = data.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return invalidPayload();
  return values[0];
}
function failure(error: unknown) {
  if (error instanceof OrderItemEditError) return { ok: false as const, code: error.code, message: error.message };
  if (error instanceof ActionNoteValidationError) return { ok: false as const, code: "INVALID_REASON", message: error.message };
  throw error;
}

export async function previewSalesOrderItemChanges(input: unknown) {
  const actor = await requireCurrentUser();
  try {
    const request = previewRequest(input);
    const preview = await prisma.$transaction(tx => previewOrderItemEdit(tx, request, actor), { timeout: 20000 });
    return { ok: true as const, preview };
  } catch (error) { return failure(error); }
}

export async function saveSalesOrderItemChanges(formData: FormData) {
  const actor = await requireCurrentUser();
  try {
    for (const key of formData.keys()) {
      if (!key.startsWith("$ACTION_") && !["id", "version", "items", "quoteHash", "confirmationNote"].includes(key)) invalidPayload();
    }
    const rawItems = singleText(formData, "items");
    let items: unknown;
    try { items = JSON.parse(rawItems); } catch { return failure(new OrderItemEditError("INVALID_PAYLOAD", "The item list is invalid.")); }
    const rawVersion = singleText(formData, "version");
    if (!/^\d+$/.test(rawVersion)) invalidPayload();
    const request = previewRequest({ id: singleText(formData, "id"), expectedVersion: Number(rawVersion), items });
    const result = await prisma.$transaction(tx => applyOrderItemEdit(tx, {
      ...request, quoteHash: singleText(formData, "quoteHash"), reason: singleText(formData, "confirmationNote"),
    }, actor), { timeout: 20000 });
    for (const path of ["/", "/dashboard", "/sales-orders", "/customer-purchase-orders", "/invoices", "/payments", "/pick-pack",
      "/surat-jalan", "/receivables", "/collections", "/customers", "/customer-inquiries", "/audit-trail"]) revalidatePath(path);
    const href = `${result.source === "CUSTOMER_PO" ? "/customer-purchase-orders" : "/sales-orders"}/${result.id}`;
    revalidatePath(href);
    if (result.invoiceId) revalidatePath(`/invoices/${result.invoiceId}/print`);
    if (result.pickingListId) revalidatePath(`/pick-pack/${result.pickingListId}/print`);
    return { ok: true as const, result, href };
  } catch (error) { return failure(error); }
}
