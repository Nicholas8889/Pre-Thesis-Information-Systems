import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "../../src/lib/auth";
import {
  buildSitAuthMarker,
  cleanupSitAuthFixtures
} from "../helpers/sit-auth-fixtures";

const actor = vi.hoisted(() => ({
  id: "sit-auth-admin-actor",
  username: "sit_auth_admin_actor",
  displayName: "SIT Auth Admin",
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
vi.mock("@/lib/session", () => ({
  requireCurrentUser: vi.fn(async () => actor)
}));

import { createAccount } from "../../src/lib/auth-actions";

const prisma = new PrismaClient();

function accountForm(username: string, password: string) {
  const form = new FormData();
  form.set("username", username);
  form.set("displayName", "Concurrent SIT User");
  form.set("password", password);
  form.set("role", "SALES");
  form.set("status", "Active");
  form.set("confirmationNote", "Concurrent account creation retest");
  return form;
}

describe("account creation server action", () => {
  afterAll(() => prisma.$disconnect());

  it("commits exactly one canonical account and audit under concurrent requests", async () => {
    const marker = buildSitAuthMarker(`action_race_${Date.now()}`);
    const firstPassword = "First-SIT-Password-123!";
    const secondPassword = "Second-SIT-Password-123!";

    try {
      const results = await Promise.allSettled([
        createAccount(accountForm(`  ${marker}  `, firstPassword)),
        createAccount(accountForm(marker.toUpperCase(), secondPassword))
      ]);

      expect(results).toHaveLength(2);
      const redirectMessages = results.map(result =>
        result.status === "rejected" ? String(result.reason) : "resolved"
      );
      expect(redirectMessages.filter(message => message.includes("success=Account added"))).toHaveLength(1);
      expect(redirectMessages.filter(message => message.includes("Username already exists"))).toHaveLength(1);

      const users = await prisma.user.findMany({ where: { username: marker } });
      expect(users).toHaveLength(1);
      expect(
        verifyPassword(firstPassword, users[0].passwordHash) ||
          verifyPassword(secondPassword, users[0].passwordHash)
      ).toBe(true);

      const audits = await prisma.auditTrail.findMany({
        where: { entityId: users[0].id, action: "ACCOUNT_CREATED" }
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].newValue).not.toContain(firstPassword);
      expect(audits[0].newValue).not.toContain(secondPassword);
      expect(audits[0].newValue).not.toContain(users[0].passwordHash);
    } finally {
      await cleanupSitAuthFixtures(prisma, marker);
    }

    expect(await prisma.user.count({ where: { username: marker } })).toBe(0);
  }, 50_000);
});
