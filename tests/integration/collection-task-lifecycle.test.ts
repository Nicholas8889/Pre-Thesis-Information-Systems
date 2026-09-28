import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => ({
  id: "sit-collection-admin",
  username: "sit_collection_admin",
  displayName: "SIT Collection Admin",
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

import {
  transitionCollectionTask,
  updateCollectionTask
} from "../../src/lib/actions";
import { getDashboardLists } from "../../src/lib/dashboard-data";
import { getRoleNotifications } from "../../src/lib/notifications";

const prisma = new PrismaClient();

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function createFixture(label: string) {
  const marker = `SIT Batch 3 Collection ${label} ${Date.now()} ${Math.random()}`;
  const customer = await prisma.customer.create({
    data: {
      name: marker,
      companyName: marker,
      phone: "-",
      email: "",
      address: "SIT only",
      customerSegment: "SIT"
    }
  });
  const task = await prisma.collectionTask.create({
    data: {
      customerId: customer.id,
      scheduledDate: new Date("1900-01-01T00:00:00.000Z"),
      status: "Planned",
      notes: "Initial collection note"
    }
  });
  return { customer, task };
}

async function cleanup(customerId: string, taskIds: string[]) {
  await prisma.auditTrail.deleteMany({ where: { entityId: { in: taskIds } } });
  await prisma.collectionTask.deleteMany({ where: { id: { in: taskIds } } });
  await prisma.customer.delete({ where: { id: customerId } });
}

describe("Collection Task lifecycle and optimistic concurrency", () => {
  afterAll(() => prisma.$disconnect());

  it("supports Planned edit -> Done and rejects a stale follow-up without partial changes", async () => {
    const { customer, task } = await createFixture("lifecycle");
    try {
      const projectionNow = new Date("1899-12-31T05:00:00.000Z");
      const beforeLists = await getDashboardLists(actor, projectionNow);
      const beforeNotifications = await getRoleNotifications(actor, { now: () => projectionNow });
      expect(beforeLists.admin?.collectionTasksToShow.map(item => item.id)).toContain(task.id);
      expect(beforeNotifications.map(item => item.id)).toContain(`collection-deadline:${task.id}`);

      await expect(updateCollectionTask(form({
        taskId: task.id,
        expectedVersion: String(task.version),
        scheduledDate: "1900-01-05",
        notes: "Rescheduled with customer",
        confirmationNote: "Customer requested a later date"
      }))).rejects.toThrow("success=Collection%20task%20updated");

      const edited = await prisma.collectionTask.findUniqueOrThrow({ where: { id: task.id } });
      expect(edited).toMatchObject({
        status: "Planned",
        version: task.version + 1,
        notes: "Rescheduled with customer"
      });
      expect(edited.scheduledDate.toISOString()).toBe("1900-01-05T00:00:00.000Z");

      await expect(transitionCollectionTask(form({
        taskId: task.id,
        expectedVersion: String(edited.version),
        status: "Done",
        confirmationNote: "Payment collection follow-up completed"
      }))).rejects.toThrow("success=Collection%20task%20marked%20done");

      const completed = await prisma.collectionTask.findUniqueOrThrow({ where: { id: task.id } });
      expect(completed).toMatchObject({
        status: "Done",
        version: edited.version + 1,
        notes: "Rescheduled with customer"
      });
      expect(completed.scheduledDate.toISOString()).toBe("1900-01-05T00:00:00.000Z");
      expect(await prisma.collectionTask.count({ where: { id: task.id, status: "Planned" } })).toBe(0);
      const afterLists = await getDashboardLists(actor, projectionNow);
      const afterNotifications = await getRoleNotifications(actor, { now: () => projectionNow });
      expect(afterLists.admin?.collectionTasksToShow.map(item => item.id)).not.toContain(task.id);
      expect(afterNotifications.map(item => item.id)).not.toContain(`collection-deadline:${task.id}`);

      await expect(transitionCollectionTask(form({
        taskId: task.id,
        expectedVersion: String(edited.version),
        status: "Cancelled",
        confirmationNote: "Stale cancellation must lose"
      }))).rejects.toThrow("changed%20in%20another%20session");

      const afterStale = await prisma.collectionTask.findUniqueOrThrow({ where: { id: task.id } });
      expect(afterStale).toEqual(completed);
      const audits = await prisma.auditTrail.findMany({
        where: { entityId: task.id },
        orderBy: { createdAt: "asc" }
      });
      expect(audits.map(audit => audit.action)).toEqual(["UPDATED", "COMPLETED"]);
    } finally {
      await cleanup(customer.id, [task.id]);
    }
  }, 30_000);

  it("allows exactly one Done/Cancelled race winner and rejects transition-only field tampering", async () => {
    const { customer, task } = await createFixture("race");
    try {
      const race = await Promise.allSettled([
        transitionCollectionTask(form({
          taskId: task.id,
          expectedVersion: String(task.version),
          status: "Done",
          confirmationNote: "Done from session A"
        })),
        transitionCollectionTask(form({
          taskId: task.id,
          expectedVersion: String(task.version),
          status: "Cancelled",
          confirmationNote: "Cancelled from session B"
        }))
      ]);
      const messages = race.map(result =>
        result.status === "rejected" ? String(result.reason) : "resolved"
      );
      expect(messages.filter(message => message.includes("success=Collection%20task%20marked"))).toHaveLength(1);
      expect(messages.filter(message => message.includes("changed%20in%20another%20session"))).toHaveLength(1);

      const terminal = await prisma.collectionTask.findUniqueOrThrow({ where: { id: task.id } });
      expect(["Done", "Cancelled"]).toContain(terminal.status);
      expect(terminal.version).toBe(task.version + 1);
      expect(terminal.scheduledDate.toISOString()).toBe(task.scheduledDate.toISOString());
      expect(terminal.notes).toBe(task.notes);
      expect(await prisma.auditTrail.count({ where: { entityId: task.id } })).toBe(1);

      const second = await createFixture("tamper");
      try {
        await expect(transitionCollectionTask(form({
          taskId: second.task.id,
          expectedVersion: String(second.task.version),
          status: "Done",
          confirmationNote: "Payload also tries to edit schedule",
          scheduledDate: "2030-01-01"
        }))).rejects.toThrow("Invalid%20Collection%20transition%20payload");
        expect(await prisma.collectionTask.findUniqueOrThrow({ where: { id: second.task.id } })).toEqual(second.task);
        expect(await prisma.auditTrail.count({ where: { entityId: second.task.id } })).toBe(0);
      } finally {
        await cleanup(second.customer.id, [second.task.id]);
      }
    } finally {
      await cleanup(customer.id, [task.id]);
    }
  }, 40_000);
});
