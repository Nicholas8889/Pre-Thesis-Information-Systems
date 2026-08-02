"use server";

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, roleLabel } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeActionNote } from "@/lib/action-notes";
import { verifySignedSession } from "@/lib/session-token";

type AuditTrailInput = {
  moduleName: string;
  entityType: string;
  entityId: string;
  transactionCode: string;
  action: string;
  changeSummary: string;
  actionNote?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function createAuditTrailLog(input: AuditTrailInput) {
  try {
    const actor = await getAuditActor();

    await prisma.auditTrail.create({
      data: {
        actorUserId: actor.userId,
        actorUsername: actor.username,
        actorDisplayName: actor.displayName,
        actorRole: actor.role,
        moduleName: input.moduleName,
        entityType: input.entityType,
        entityId: input.entityId,
        transactionCode: input.transactionCode || input.entityId,
        action: input.action,
        changeSummary: input.changeSummary,
        actionNote: normalizeActionNote(input.actionNote ?? "") || null,
        oldValue: stringifyAuditValue(input.oldValue),
        newValue: stringifyAuditValue(input.newValue)
      }
    });
  } catch (error) {
    console.error("Failed to create audit trail log", error);
  }
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
