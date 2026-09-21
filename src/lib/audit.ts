"use server";

import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { AUTH_COOKIE_NAME, roleLabel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeActionNote } from "@/lib/action-notes";
import { verifySignedSession } from "@/lib/session-token";

type AuditTrailInput = {
  actor?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  moduleName: string;
  entityType: string;
  entityId: string;
  recordReference: string;
  action: string;
  changeSummary: string;
  actionNote?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

type AuditTrailActor = NonNullable<AuditTrailInput["actor"]>;
type AtomicAuditTrailInput = AuditTrailInput & { actor: AuditTrailActor };
type AuditTrailTransaction = Pick<Prisma.TransactionClient, "auditTrail">;

export async function createAuditTrailLog(input: AuditTrailInput): Promise<void>;
export async function createAuditTrailLog(
  input: AtomicAuditTrailInput | AtomicAuditTrailInput[],
  options: { transaction: AuditTrailTransaction }
): Promise<void>;
export async function createAuditTrailLog(
  input: AuditTrailInput | AtomicAuditTrailInput[],
  options?: { transaction: AuditTrailTransaction }
) {
  const inputs = Array.isArray(input) ? input : [input];

  if (options?.transaction) {
    await options.transaction.auditTrail.createMany({
      data: inputs.map(entry => {
        if (!entry.actor) throw new Error("Atomic audit trail entries require an actor");
        return buildAuditTrailData(entry, actorFromInput(entry.actor));
      })
    });
    return;
  }

  try {
    const entry = inputs[0];
    const actor = entry.actor ? actorFromInput(entry.actor) : await getAuditActor();

    await prisma.auditTrail.create({
      data: buildAuditTrailData(entry, actor)
    });
  } catch (error) {
    console.error("Failed to create audit trail log", error);
  }
}

function actorFromInput(actor: AuditTrailActor) {
  return {
    userId: actor.id,
    username: actor.username,
    displayName: actor.displayName,
    role: roleLabel(actor.role)
  };
}

function buildAuditTrailData(
  input: AuditTrailInput,
  actor: Awaited<ReturnType<typeof getAuditActor>>
): Prisma.AuditTrailCreateManyInput {
  return {
    actorUserId: actor.userId,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    actorRole: actor.role,
    moduleName: input.moduleName,
    entityType: input.entityType,
    entityId: input.entityId,
    recordReference: input.recordReference || input.entityId,
    action: input.action,
    changeSummary: input.changeSummary,
    actionNote: normalizeActionNote(input.actionNote ?? "") || null,
    oldValue: stringifyAuditValue(input.oldValue),
    newValue: stringifyAuditValue(input.newValue)
  };
}

async function getAuditActor() {
  const cookieStore = await cookies();
  const session = await verifySignedSession(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    return {
      userId: null,
      username: "System",
      displayName: "System",
      role: "SYSTEM"
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true
    }
  });

  if (!user) {
    return {
      userId: null,
      username: "System",
      displayName: "System",
      role: "SYSTEM"
    };
  }

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: roleLabel(user.role)
  };
}

function stringifyAuditValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
