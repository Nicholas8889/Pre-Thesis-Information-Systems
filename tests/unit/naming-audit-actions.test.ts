import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuditTrail: vi.fn(),
  findUser: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined
  }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditTrail: {
      create: mocks.createAuditTrail
    },
    user: {
      findUnique: mocks.findUser
    }
  }
}));

import { createAuditTrailLog } from "../../src/lib/audit";

describe("canonical audit record references", () => {
  beforeEach(() => {
    mocks.createAuditTrail.mockReset();
    mocks.findUser.mockReset();
  });

  it("stores an explicit Record Reference", async () => {
    await createAuditTrailLog({
      moduleName: "Sales Orders",
      entityType: "SALES_ORDER",
      entityId: "order-id",
      recordReference: "SO-2026-001",
      action: "CREATED",
      changeSummary: "Sales Order created"
    });

    expect(mocks.createAuditTrail).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "order-id",
        recordReference: "SO-2026-001"
      })
    });
  });

  it("falls back to the entity id when the reference is blank", async () => {
    await createAuditTrailLog({
      moduleName: "Customer Outreach",
      entityType: "CUSTOMER_OUTREACH",
      entityId: "outreach-id",
      recordReference: "",
      action: "CREATED",
      changeSummary: "Customer outreach recorded"
    });

    expect(mocks.createAuditTrail).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "outreach-id",
        recordReference: "outreach-id"
      })
    });
  });
});
