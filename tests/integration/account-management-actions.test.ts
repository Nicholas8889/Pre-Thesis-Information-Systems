import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canAuthenticateUser, hashPassword, verifyPassword } from "../../src/lib/auth";
import { signSession } from "../../src/lib/session-token";
import { resolveSessionUser } from "../../src/lib/session";

const actor = vi.hoisted(() => ({
  id: "sit-account-admin-actor",
  username: "sit_account_admin_actor",
  displayName: "SIT Account Admin",
  role: "ADMIN" as const,
  status: "Active" as const,
  sessionVersion: 1
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }
}));
vi.mock("@/lib/session", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/lib/session")>();
  return {
    ...actual,
    requireCurrentUser: vi.fn(async () => actor)
  };
});

import {
  resetAccountPassword,
  updateAccountRole,
  updateAccountStatus
} from "../../src/lib/auth-actions";

const prisma = new PrismaClient();
const originalAuthSecret = process.env.AUTH_SECRET;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("existing account management actions", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "batch-three-test-secret-long-enough-for-session-signing";
  });

  afterEach(() => {
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  });

  afterAll(() => prisma.$disconnect());

  it("applies role/status/password changes, revokes old sessions, redacts secrets, and rejects stale writes", async () => {
    const marker = `sit_auth_batch3_manage_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const oldPassword = "Old-SIT-Password-123!";
    const newPassword = "New-SIT-Password-456!";
    const target = await prisma.user.create({
      data: {
        username: marker,
        displayName: "Batch 3 Managed Account",
        passwordHash: hashPassword(oldPassword),
        role: "SALES",
        status: "Active"
      }
    });

    try {
      const oldToken = await signSession({
        userId: target.id,
        username: target.username,
        role: target.role,
        sessionVersion: target.sessionVersion,
        exp: Math.floor(Date.now() / 1000) + 300
      });

      await expect(updateAccountRole(form({
        userId: target.id,
        expectedUpdatedAt: target.updatedAt.toISOString(),
        role: "MANAGER",
        confirmationNote: "Promoted for approval responsibilities"
      }))).rejects.toThrow("success=Account role updated");

      const afterRole = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(afterRole.role).toBe("MANAGER");
      expect(afterRole.sessionVersion).toBe(target.sessionVersion + 1);
      await expect(resolveSessionUser(oldToken, prisma)).resolves.toBeNull();

      await expect(resetAccountPassword(form({
        userId: target.id,
        expectedUpdatedAt: afterRole.updatedAt.toISOString(),
        password: newPassword,
        confirmationNote: "Credential reset requested by account owner"
      }))).rejects.toThrow("success=Password reset and existing sessions revoked");

      const afterPassword = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(verifyPassword(oldPassword, afterPassword.passwordHash)).toBe(false);
      expect(verifyPassword(newPassword, afterPassword.passwordHash)).toBe(true);
      expect(afterPassword.sessionVersion).toBe(afterRole.sessionVersion + 1);

      await expect(updateAccountStatus(form({
        userId: target.id,
        expectedUpdatedAt: afterPassword.updatedAt.toISOString(),
        status: "Inactive",
        confirmationNote: "Account access is no longer required"
      }))).rejects.toThrow("success=Account status updated");

      const inactive = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(inactive.status).toBe("Inactive");
      expect(inactive.sessionVersion).toBe(afterPassword.sessionVersion + 1);
      expect(canAuthenticateUser(inactive, newPassword)).toBe(false);

      await expect(updateAccountRole(form({
        userId: target.id,
        expectedUpdatedAt: target.updatedAt.toISOString(),
        role: "ADMIN",
        confirmationNote: "This stale form must not overwrite current state"
      }))).rejects.toThrow("Account changed in another session");

      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(unchanged).toEqual(inactive);
      const audits = await prisma.auditTrail.findMany({
        where: { entityId: target.id },
        orderBy: { createdAt: "asc" }
      });
      expect(audits.map(audit => audit.action)).toEqual([
        "ACCOUNT_ROLE_CHANGED",
        "ACCOUNT_PASSWORD_RESET",
        "ACCOUNT_DEACTIVATED"
      ]);
      const auditPayload = JSON.stringify(audits);
      expect(auditPayload).not.toContain(oldPassword);
      expect(auditPayload).not.toContain(newPassword);
      expect(auditPayload).not.toContain(target.passwordHash);
      expect(auditPayload).not.toContain(afterPassword.passwordHash);
      expect(auditPayload).toContain("[REDACTED]");
    } finally {
      await prisma.auditTrail.deleteMany({ where: { entityId: target.id } });
      await prisma.user.delete({ where: { id: target.id } });
    }
  }, 40_000);
});
