import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { buildPortfolioScope } from "../../src/lib/portfolio-scope";
import { resolveSessionUser } from "../../src/lib/session";
import { signSession } from "../../src/lib/session-token";
import { verifyPassword } from "../../src/lib/auth";
import {
  buildSitAuthMarker,
  createSitAuthFixtures,
  SIT_AUTH_PREFIX
} from "../helpers/sit-auth-fixtures";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_BATCH_ONE_AUTH_FOUNDATION";

describe("Batch 1 auth and portfolio foundation", () => {
  afterAll(() => prisma.$disconnect());

  it("creates isolated fixtures, separates Sales portfolios, and revokes a stale session", async () => {
    const marker = buildSitAuthMarker(`foundation_${Date.now()}`);
    let activeTargetId = "";

    await expect(
      prisma.$transaction(
        async tx => {
          const fixture = await createSitAuthFixtures(tx, marker);
          activeTargetId = fixture.users.activeTarget.id;

          expect(fixture.users.inactiveTarget.status).toBe("Inactive");
          expect(fixture.users.inactiveTarget.passwordHash).not.toContain(fixture.password);
          expect(verifyPassword(fixture.password, fixture.users.inactiveTarget.passwordHash)).toBe(true);

          const salesAScope = buildPortfolioScope(fixture.users.salesA);
          const salesBScope = buildPortfolioScope(fixture.users.salesB);
          await expect(tx.customer.findMany({ where: salesAScope.customerWhere })).resolves.toEqual([
            expect.objectContaining({ id: fixture.customers.customerA.id })
          ]);
          await expect(tx.customer.findMany({ where: salesBScope.customerWhere })).resolves.toEqual([
            expect.objectContaining({ id: fixture.customers.customerB.id })
          ]);

          const session = await signSession({
            userId: fixture.users.activeTarget.id,
            username: fixture.users.activeTarget.username,
            role: fixture.users.activeTarget.role,
            sessionVersion: fixture.users.activeTarget.sessionVersion,
            exp: Math.floor(Date.now() / 1000) + 60
          });
          await expect(resolveSessionUser(session, tx)).resolves.toMatchObject({
            id: fixture.users.activeTarget.id,
            status: "Active"
          });

          await tx.user.update({
            where: { id: fixture.users.activeTarget.id },
            data: { status: "Inactive", sessionVersion: { increment: 1 } }
          });
          await expect(resolveSessionUser(session, tx)).resolves.toBeNull();

          throw new Error(ROLLBACK);
        },
        { maxWait: 10_000, timeout: 40_000 }
      )
    ).rejects.toThrow(ROLLBACK);

    expect(await prisma.user.count({ where: { username: { startsWith: marker } } })).toBe(0);
    expect(await prisma.customer.count({ where: { name: { startsWith: marker } } })).toBe(0);
    expect(activeTargetId).not.toBe("");
  }, 50_000);

  it("rolls back the entire fixture transaction on a duplicate username", async () => {
    const marker = buildSitAuthMarker(`duplicate_${Date.now()}`);

    await expect(
      prisma.$transaction(
        async tx => {
          const fixture = await createSitAuthFixtures(tx, marker);
          await tx.user.create({
            data: {
              username: fixture.users.adminA.username,
              displayName: "Duplicate",
              passwordHash: "not-used",
              role: "ADMIN"
            }
          });
        },
        { maxWait: 10_000, timeout: 40_000 }
      )
    ).rejects.toMatchObject({ code: "P2002" });

    expect(marker.startsWith(SIT_AUTH_PREFIX)).toBe(true);
    expect(await prisma.user.count({ where: { username: { startsWith: marker } } })).toBe(0);
  }, 50_000);
});
