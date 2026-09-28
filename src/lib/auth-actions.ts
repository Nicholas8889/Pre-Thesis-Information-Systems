"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type UserRole, type UserStatus } from "@prisma/client";
import {
  canAuthenticateUser,
  hashPassword,
  needsPasswordRehash
} from "@/lib/auth";
import { createAuditTrailLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canRole } from "@/lib/role-access";
import { createSession, deleteSession, requireCurrentUser } from "@/lib/session";
import { normalizeActionNote } from "@/lib/action-notes";
import {
  canonicalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername
} from "@/lib/account-policy";

const protectedPaths = [
  "/",
  "/customers",
  "/sales-orders",
  "/customer-purchase-orders",
  "/invoices",
  "/payments",
  "/receivables",
  "/collections",
  "/customer-outreach",
  "/surat-jalan",
  "/audit-trail",
  "/settings"
];

class AccountMutationConflictError extends Error {
  constructor() {
    super("Account changed before this request was committed");
    this.name = "AccountMutationConflictError";
  }
}

export async function login(formData: FormData) {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    redirect("/login?error=Deployment setup is missing AUTH_SECRET. Add it in Vercel Environment Variables, then redeploy.");
  }

  const username = canonicalizeUsername(getString(formData, "username"));
  const password = getString(formData, "password");

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    redirect("/login?error=Invalid username or password");
  }

  if (!canAuthenticateUser(user, password)) {
    redirect("/login?error=Invalid username or password");
  }

  if (needsPasswordRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) }
    });
  }

  await createSession(user);

  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function createAccount(formData: FormData) {
  const currentUser = await requireCurrentUser();
  const actionNote = normalizeActionNote(getString(formData, "confirmationNote"));
  if (!canRole(currentUser?.role, "CREATE_ACCOUNT")) {
    redirect("/settings?error=Only Admin can create accounts");
  }

  let username: string;
  let displayName: string;
  let password: string;
  let role: UserRole;
  let status: UserStatus;
  try {
    username = validateUsername(getString(formData, "username"));
    displayName = validateDisplayName(getString(formData, "displayName"));
    password = validatePassword(getString(formData, "password"));
    role = getRequiredEnum(formData, "role", ["ADMIN", "SALES", "MANAGER"]);
    status = getRequiredEnum(formData, "status", ["Active", "Inactive"]);
  } catch (error) {
    redirectWithError(error);
  }

  try {
    await prisma.$transaction(async transaction => {
      const user = await transaction.user.create({
        data: {
          username,
          displayName,
          passwordHash: hashPassword(password),
          role,
          status
        }
      });

      await createAuditTrailLog(
        {
          actor: currentUser,
          moduleName: "Settings",
          entityType: "USER",
          entityId: user.id,
          recordReference: user.username,
          action: "ACCOUNT_CREATED",
          actionNote,
          changeSummary: `Account ${user.username} created`,
          newValue: {
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            status: user.status
          }
        },
        { transaction }
      );
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      redirect("/settings?error=Username already exists");
    }
    throw error;
  }

  revalidateProtectedPaths();
  redirect("/settings?success=Account added");
}

export async function updateAccountStatus(formData: FormData) {
  const currentUser = await requireAccountAdmin();
  const userId = getRequiredId(formData, "userId");
  const expectedUpdatedAt = getExpectedUpdatedAt(formData);
  const status = getRequiredEnum<UserStatus>(formData, "status", ["Active", "Inactive"]);
  const actionNote = getRequiredActionNote(formData);

  if (userId === currentUser.id && status === "Inactive") {
    redirect("/settings?error=You cannot deactivate your own account");
  }

  try {
    await prisma.$transaction(async transaction => {
      const existing = await transaction.user.findUnique({ where: { id: userId } });
      if (!existing || existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new AccountMutationConflictError();
      }
      if (existing.status === status) return;
      const claimed = await transaction.user.updateMany({
        where: { id: userId, updatedAt: expectedUpdatedAt },
        data: { status, sessionVersion: { increment: 1 } }
      });
      if (claimed.count !== 1) throw new AccountMutationConflictError();
      const user = await transaction.user.findUniqueOrThrow({ where: { id: userId } });
      await createAuditTrailLog(
        {
          actor: currentUser,
          moduleName: "Settings",
          entityType: "USER",
          entityId: user.id,
          recordReference: user.username,
          action: status === "Inactive" ? "ACCOUNT_DEACTIVATED" : "ACCOUNT_ACTIVATED",
          actionNote,
          changeSummary: `Account ${user.username} status changed to ${status}`,
          oldValue: { status: existing.status },
          newValue: { status: user.status }
        },
        { transaction }
      );
    });
  } catch (error) {
    redirectAccountConflict(error);
  }

  revalidateProtectedPaths();
  redirect("/settings?success=Account status updated");
}

export async function updateAccountRole(formData: FormData) {
  const currentUser = await requireAccountAdmin();
  const userId = getRequiredId(formData, "userId");
  const expectedUpdatedAt = getExpectedUpdatedAt(formData);
  const role = getRequiredEnum<UserRole>(formData, "role", ["ADMIN", "SALES", "MANAGER"]);
  const actionNote = getRequiredActionNote(formData);

  if (userId === currentUser.id) {
    redirect("/settings?error=You cannot change your own role");
  }

  try {
    await prisma.$transaction(async transaction => {
      const existing = await transaction.user.findUnique({ where: { id: userId } });
      if (!existing || existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new AccountMutationConflictError();
      }
      if (existing.role === role) return;
      const claimed = await transaction.user.updateMany({
        where: { id: userId, updatedAt: expectedUpdatedAt },
        data: { role, sessionVersion: { increment: 1 } }
      });
      if (claimed.count !== 1) throw new AccountMutationConflictError();
      const user = await transaction.user.findUniqueOrThrow({ where: { id: userId } });
      await createAuditTrailLog(
        {
          actor: currentUser,
          moduleName: "Settings",
          entityType: "USER",
          entityId: user.id,
          recordReference: user.username,
          action: "ACCOUNT_ROLE_CHANGED",
          actionNote,
          changeSummary: `Account ${user.username} role changed to ${role}`,
          oldValue: { role: existing.role },
          newValue: { role: user.role }
        },
        { transaction }
      );
    });
  } catch (error) {
    redirectAccountConflict(error);
  }

  revalidateProtectedPaths();
  redirect("/settings?success=Account role updated");
}

export async function resetAccountPassword(formData: FormData) {
  const currentUser = await requireAccountAdmin();
  const userId = getRequiredId(formData, "userId");
  const expectedUpdatedAt = getExpectedUpdatedAt(formData);
  const actionNote = getRequiredActionNote(formData);
  let password: string;
  try {
    password = validatePassword(getString(formData, "password"));
  } catch (error) {
    redirectWithError(error);
  }

  try {
    await prisma.$transaction(async transaction => {
      const existing = await transaction.user.findUnique({ where: { id: userId } });
      if (!existing || existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new AccountMutationConflictError();
      }
      const claimed = await transaction.user.updateMany({
        where: { id: userId, updatedAt: expectedUpdatedAt },
        data: {
          passwordHash: hashPassword(password),
          sessionVersion: { increment: 1 }
        }
      });
      if (claimed.count !== 1) throw new AccountMutationConflictError();
      const user = await transaction.user.findUniqueOrThrow({ where: { id: userId } });
      await createAuditTrailLog(
        {
          actor: currentUser,
          moduleName: "Settings",
          entityType: "USER",
          entityId: user.id,
          recordReference: user.username,
          action: "ACCOUNT_PASSWORD_RESET",
          actionNote,
          changeSummary: `Password reset for account ${user.username}`,
          oldValue: { password: "[REDACTED]" },
          newValue: { password: "[REDACTED]" }
        },
        { transaction }
      );
    });
  } catch (error) {
    redirectAccountConflict(error);
  }

  revalidateProtectedPaths();
  redirect("/settings?success=Password reset and existing sessions revoked");
}

function getString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function getRequiredEnum<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[]
) {
  const value = getString(formData, name) as T;
  if (!allowed.includes(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function getRequiredId(formData: FormData, name: string) {
  const value = getString(formData, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getExpectedUpdatedAt(formData: FormData) {
  const value = getString(formData, "expectedUpdatedAt");
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    redirect("/settings?error=Invalid or missing account concurrency token");
  }
  return parsed;
}

function getRequiredActionNote(formData: FormData) {
  try {
    return normalizeActionNote(getString(formData, "confirmationNote"), "required");
  } catch (error) {
    redirectWithError(error);
  }
}

async function requireAccountAdmin() {
  const currentUser = await requireCurrentUser();
  if (!canRole(currentUser.role, "CREATE_ACCOUNT")) {
    redirect("/settings?error=Only Admin can manage accounts");
  }
  return currentUser;
}

function revalidateProtectedPaths() {
  for (const path of protectedPaths) revalidatePath(path);
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function redirectWithError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Invalid account data";
  redirect(`/settings?error=${encodeURIComponent(message)}`);
}

function redirectAccountConflict(error: unknown): never {
  if (error instanceof AccountMutationConflictError) {
    redirect("/settings?error=Account changed in another session. Refresh and try again");
  }
  throw error;
}
