"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole, UserStatus } from "@prisma/client";
import { hashPassword, needsPasswordRehash, verifyPassword } from "@/lib/auth";
import { createAuditTrailLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canRole } from "@/lib/role-access";
import { createSession, deleteSession, requireCurrentUser } from "@/lib/session";
import { normalizeActionNote } from "@/lib/action-notes";

const protectedPaths = [
  "/",
  "/customers",
  "/sales-orders",
  "/invoices",
  "/payments",
  "/receivables",
  "/billing",
  "/follow-ups",
  "/surat-jalan",
  "/audit-trail",
  "/settings"
];

export async function login(formData: FormData) {
  const username = getString(formData, "username");
  const password = getString(formData, "password");

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user || user.status !== "Active" || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=Invalid username or password");
  }

  if (needsPasswordRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) }
    });
  }

  await createSession(user);

  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function createAccount(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  if (!canRole(currentUser?.role, "CREATE_ACCOUNT")) {
    redirect("/settings?error=Only Admin and Manager roles can create accounts");
  }

  const username = getString(formData, "username");
  const displayName = getString(formData, "displayName");
  const password = getString(formData, "password");
  const role = getStatus<UserRole>(
    formData,
    "role",
    ["ADMIN", "SALES", "MANAGER"],
    "SALES"
  );
  const status = getStatus<UserStatus>(
    formData,
    "status",
    ["Active", "Inactive"],
    "Active"
  );

  if (!username || !displayName || !password) {
    redirect("/settings?error=Username, display name, and password are required");
  }

  const existingUser = await prisma.user.findUnique({
    where: { username }
  });

  if (existingUser) {
    redirect("/settings?error=Username already exists");
  }

  const user = await prisma.user.create({
    data: {
      username,
      displayName,
      passwordHash: hashPassword(password),
      role,
      status
    }
  });

  await createAuditTrailLog({
    moduleName: "Settings",
    entityType: "USER",
    entityId: user.id,
    transactionCode: user.username,
    action: "ACCOUNT_CREATED",
    actionNote,
    changeSummary: `Account ${user.username} created`,
    newValue: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      status: user.status
    }
  });

  for (const path of protectedPaths) {
    revalidatePath(path);
  }

  redirect("/settings?success=Account added");
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
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
