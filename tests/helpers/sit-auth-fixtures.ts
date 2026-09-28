import type { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/auth";

export const SIT_AUTH_PREFIX = "sit_auth_";
export const SIT_AUTH_PASSWORD = "SIT-Only-Password-123!";

type FixtureClient = Pick<Prisma.TransactionClient, "user" | "customer">;
type CleanupClient = Pick<PrismaClient, "auditTrail" | "customer" | "user">;

export function buildSitAuthMarker(runId = `${Date.now()}_${process.pid}`) {
  const safeRunId = runId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return `${SIT_AUTH_PREFIX}${safeRunId}`;
}

export async function createSitAuthFixtures(
  db: FixtureClient,
  marker = buildSitAuthMarker()
) {
  if (!marker.startsWith(SIT_AUTH_PREFIX)) {
    throw new Error(`SIT auth fixture marker must start with ${SIT_AUTH_PREFIX}`);
  }

  const passwordHash = hashPassword(SIT_AUTH_PASSWORD);
  const createUser = (suffix: string, role: "ADMIN" | "MANAGER" | "SALES", status: "Active" | "Inactive" = "Active") =>
    db.user.create({
      data: {
        username: `${marker}_${suffix}`,
        displayName: `${marker} ${suffix}`,
        passwordHash,
        role,
        status
      }
    });

  const [adminA, adminB, manager, salesA, salesB, activeTarget, inactiveTarget] =
    await Promise.all([
      createUser("admin_a", "ADMIN"),
      createUser("admin_b", "ADMIN"),
      createUser("manager", "MANAGER"),
      createUser("sales_a", "SALES"),
      createUser("sales_b", "SALES"),
      createUser("active_target", "SALES"),
      createUser("inactive_target", "SALES", "Inactive")
    ]);

  const [customerA, customerB] = await Promise.all([
    db.customer.create({
      data: {
        name: `${marker} Contact A`,
        companyName: `${marker} Company A`,
        phone: "",
        email: "",
        address: "SIT only",
        customerSegment: "SIT",
        portfolioOwnerUserId: salesA.id
      }
    }),
    db.customer.create({
      data: {
        name: `${marker} Contact B`,
        companyName: `${marker} Company B`,
        phone: "",
        email: "",
        address: "SIT only",
        customerSegment: "SIT",
        portfolioOwnerUserId: salesB.id
      }
    })
  ]);

  return {
    marker,
    password: SIT_AUTH_PASSWORD,
    users: { adminA, adminB, manager, salesA, salesB, activeTarget, inactiveTarget },
    customers: { customerA, customerB }
  };
}

export async function cleanupSitAuthFixtures(db: CleanupClient, marker: string) {
  if (!marker.startsWith(SIT_AUTH_PREFIX)) {
    throw new Error("Refusing to clean records without the SIT auth marker");
  }

  await db.auditTrail.deleteMany({
    where: {
      OR: [
        { actorUsername: { startsWith: marker } },
        { recordReference: { startsWith: marker } }
      ]
    }
  });
  await db.customer.deleteMany({
    where: {
      OR: [
        { name: { startsWith: marker } },
        { companyName: { startsWith: marker } }
      ]
    }
  });
  await db.user.deleteMany({ where: { username: { startsWith: marker } } });
}
