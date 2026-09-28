import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuditTrail: vi.fn(),
  findUser: vi.fn(),
  verifySession: vi.fn()
}));

vi.mock("server-only", () => ({}));

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

vi.mock("@/lib/session-token", () => ({
  verifySignedSession: mocks.verifySession
}));

import { createAuditTrailLog } from "../../src/lib/audit";

describe("canonical audit record references", () => {
  beforeEach(() => {
    mocks.createAuditTrail.mockReset();
    mocks.findUser.mockReset();
    mocks.verifySession.mockReset();
    mocks.verifySession.mockResolvedValue({
      userId: "user-1",
      username: "auditor",
      role: "ADMIN",
      sessionVersion: 1
    });
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      username: "auditor",
      displayName: "Audit Admin",
      role: "ADMIN",
      status: "Active",
      sessionVersion: 1
    });
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

  it("rejects a caller-supplied actor outside a trusted transaction", async () => {
    await expect(createAuditTrailLog({
      actor: {
        id: "victim-admin",
        username: "victim",
        displayName: "Victim Admin",
        role: "ADMIN"
      },
      moduleName: "Audit Trail",
      entityType: "AUDIT_TRAIL",
      entityId: "spoofed",
      recordReference: "spoofed",
      action: "ARBITRARY",
      changeSummary: "Spoofed manual audit"
    })).rejects.toThrow("Audit actor must come from the authenticated session");
    expect(mocks.createAuditTrail).not.toHaveBeenCalled();
  });

  it("propagates mandatory audit storage failures", async () => {
    mocks.createAuditTrail.mockRejectedValueOnce(new Error("AUDIT_INSERT_FAILED"));
    await expect(createAuditTrailLog({
      moduleName: "Customers",
      entityType: "CUSTOMER",
      entityId: "customer-1",
      recordReference: "Customer 1",
      action: "UPDATED",
      changeSummary: "Customer updated"
    })).rejects.toThrow("AUDIT_INSERT_FAILED");
  });
});
