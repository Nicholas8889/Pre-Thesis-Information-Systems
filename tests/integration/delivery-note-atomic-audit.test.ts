import { afterAll, describe, expect, it } from "vitest";
import { createAuditTrailLog } from "../../src/lib/audit";
import { prisma } from "../../src/lib/prisma";

describe("delivery note atomic audit integration", () => {
  afterAll(() => prisma.$disconnect());

  it("writes related audit entries together and rolls them back with the business transaction", async () => {
    const marker = `ATOMIC-AUDIT-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(prisma.$transaction(async tx => {
      await createAuditTrailLog([
        {
          actor: { id: "verify-user", username: "verify", displayName: "Verifier", role: "ADMIN" },
          moduleName: "Surat Jalan",
          entityType: "DELIVERY_NOTE",
          entityId: `${marker}-delivery-note`,
          recordReference: `${marker}-delivery-note`,
          action: "VERIFY",
          changeSummary: "Atomic audit verification"
        },
        {
          actor: { id: "verify-user", username: "verify", displayName: "Verifier", role: "ADMIN" },
          moduleName: "Customer Inquiry",
          entityType: "CUSTOMER_INQUIRY",
          entityId: `${marker}-inquiry`,
          recordReference: `${marker}-inquiry`,
          action: "VERIFY",
          changeSummary: "Atomic audit verification"
        }
      ], { transaction: tx });

      expect(await tx.auditTrail.count({
        where: { recordReference: { startsWith: marker } }
      })).toBe(2);

      throw new Error("ROLLBACK_ATOMIC_AUDIT_TEST");
    }, { maxWait: 10_000, timeout: 20_000 })).rejects.toThrow("ROLLBACK_ATOMIC_AUDIT_TEST");

    expect(await prisma.auditTrail.count({
      where: { recordReference: { startsWith: marker } }
    })).toBe(0);
  }, 30_000);
});
