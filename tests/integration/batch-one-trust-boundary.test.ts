import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  failAudit: false,
  user: {
    id: "",
    username: "",
    displayName: "Batch 1 Sales",
    role: "SALES" as const,
    status: "Active" as const,
    sessionVersion: 1
  }
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }
}));
vi.mock("@/lib/session", () => ({ requireCurrentUser: async () => context.user }));
vi.mock("@/lib/audit", () => ({
  createAuditTrailLog: vi.fn(async (input, options) => {
    if (context.failAudit) throw new Error("FAULT_INJECTED_AUDIT");
    const entries = Array.isArray(input) ? input : [input];
    await options.transaction.auditTrail.createMany({
      data: entries.map(entry => ({
        actorUserId: entry.actor.id,
        actorUsername: entry.actor.username,
        actorDisplayName: entry.actor.displayName,
        actorRole: entry.actor.role,
        moduleName: entry.moduleName,
        entityType: entry.entityType,
        entityId: entry.entityId,
        recordReference: entry.recordReference,
        action: entry.action,
        changeSummary: entry.changeSummary,
        actionNote: entry.actionNote ?? null
      }))
    });
  })
}));

import { recordCustomerOutreach, updateCustomer } from "../../src/lib/actions";

const prisma = new PrismaClient();

describe("Batch 1 trust boundary and audit atomicity", () => {
  it("rolls back a Customer update when mandatory audit storage fails, then retries once", async () => {
    const marker = `sit_b1_customer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sales = await prisma.user.create({
      data: {
        username: marker,
        displayName: "Batch 1 Sales",
        passwordHash: "test",
        role: "SALES"
      }
    });
    const customer = await prisma.customer.create({
      data: {
        name: `${marker}-old`,
        companyName: `${marker}-company`,
        phone: "",
        email: "",
        address: "Before",
        customerSegment: "Retail",
        portfolioOwnerUserId: sales.id
      }
    });
    context.user = {
      ...context.user,
      id: sales.id,
      username: sales.username
    };

    const form = () => {
      const data = new FormData();
      data.set("id", customer.id);
      data.set("name", `${marker}-new`);
      data.set("companyName", `${marker}-company`);
      data.set("address", "After");
      data.set("customerSegment", "Retail");
      data.set("status", "Active");
      return data;
    };

    try {
      context.failAudit = true;
      await expect(updateCustomer(form())).rejects.toThrow("FAULT_INJECTED_AUDIT");
      expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
        name: `${marker}-old`,
        address: "Before"
      });
      expect(await prisma.auditTrail.count({ where: { entityId: customer.id } })).toBe(0);

      context.failAudit = false;
      await expect(updateCustomer(form())).rejects.toThrow(/NEXT_REDIRECT:.*success=/);
      expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
        name: `${marker}-new`,
        address: "After"
      });
      expect(await prisma.auditTrail.count({ where: { entityId: customer.id } })).toBe(1);
    } finally {
      context.failAudit = false;
      await prisma.auditTrail.deleteMany({ where: { entityId: customer.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.user.deleteMany({ where: { id: sales.id } });
    }
  }, 40_000);

  it("rejects a direct Outreach mutation for a customer in another Sales portfolio", async () => {
    const marker = `sit_b1_outreach_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const [salesA, salesB] = await Promise.all([
      prisma.user.create({
        data: { username: `${marker}_a`, displayName: "Sales A", passwordHash: "test", role: "SALES" }
      }),
      prisma.user.create({
        data: { username: `${marker}_b`, displayName: "Sales B", passwordHash: "test", role: "SALES" }
      })
    ]);
    const customerB = await prisma.customer.create({
      data: {
        name: marker,
        companyName: marker,
        phone: "",
        email: "",
        address: "Portfolio B",
        customerSegment: "Retail",
        portfolioOwnerUserId: salesB.id
      }
    });
    context.user = {
      ...context.user,
      id: salesA.id,
      username: salesA.username,
      displayName: salesA.displayName
    };
    const form = new FormData();
    form.set("customerId", customerB.id);
    form.set("contactDate", "2026-09-27");
    form.set("notes", "Tampered cross-portfolio request");

    try {
      await expect(recordCustomerOutreach(form)).rejects.toThrow(
        /NEXT_REDIRECT:\/customer-outreach\?error=/
      );
      expect(await prisma.customerOutreach.count({ where: { customerId: customerB.id } })).toBe(0);
      expect(await prisma.auditTrail.count({ where: { entityId: customerB.id } })).toBe(0);
    } finally {
      await prisma.customerOutreach.deleteMany({ where: { customerId: customerB.id } });
      await prisma.customer.deleteMany({ where: { id: customerB.id } });
      await prisma.user.deleteMany({ where: { id: { in: [salesA.id, salesB.id] } } });
    }
  }, 40_000);
});

afterAll(async () => {
  await prisma.$disconnect();
});
