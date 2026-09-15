import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/lib/session";

type DashboardUser = { id: string; role: UserRole };
type SnapshotReader = Pick<typeof prisma, "dashboardAnalysisSnapshot">;

export type DashboardTrendPoint = {
  label: string;
  sales: number;
  payments: number;
};

export type DashboardAnalysis = {
  trend: DashboardTrendPoint[];
  lastSucceededAt: Date | null;
  lastRunStatus: "SUCCEEDED" | "FAILED" | "MISSING";
  stale: boolean;
};

export function dashboardAnalysisScopeKey(user: DashboardUser) {
  return user.role === "SALES" ? `sales:${user.id}` : "company";
}

function parseTrend(value: Prisma.JsonValue): DashboardTrendPoint[] {
  if (!Array.isArray(value)) throw new Error("Dashboard analysis trend is invalid");
  return value.map((point) => {
    if (
      !point || typeof point !== "object" || Array.isArray(point) ||
      typeof point.label !== "string" ||
      typeof point.sales !== "number" || !Number.isFinite(point.sales) ||
      typeof point.payments !== "number" || !Number.isFinite(point.payments)
    ) {
      throw new Error("Dashboard analysis trend is invalid");
    }
    return { label: point.label, sales: point.sales, payments: point.payments };
  });
}

// Allow 15 minutes for the 00:15 WIB job before flagging the previous snapshot.
export function latestExpectedAnalysisRun(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = get("year");
  const month = get("month") - 1;
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const jakartaOffsetMs = 7 * 60 * 60 * 1000;
  const expectedLocalDay = hour === 0 && minute < 30 ? day - 1 : day;
  return new Date(Date.UTC(year, month, expectedLocalDay, 0, 15) - jakartaOffsetMs);
}

export async function getDashboardAnalysis(
  user: DashboardUser,
  now = new Date(),
  db: SnapshotReader = prisma
): Promise<DashboardAnalysis> {
  const scopeKey = dashboardAnalysisScopeKey(user);
  const snapshot = await db.dashboardAnalysisSnapshot.findUnique({
    where: { scopeKey },
    select: {
      scopeType: true, ownerUserId: true, trend: true,
      lastSucceededAt: true, lastRunStatus: true
    }
  });
  if (!snapshot) {
    return { trend: [], lastSucceededAt: null, lastRunStatus: "MISSING", stale: true };
  }
  if (
    user.role === "SALES"
      ? snapshot.scopeType !== "SALES" || snapshot.ownerUserId !== user.id
      : snapshot.scopeType !== "COMPANY" || snapshot.ownerUserId !== null
  ) {
    throw new Error("Dashboard analysis scope mismatch");
  }
  if (snapshot.lastRunStatus !== "SUCCEEDED" && snapshot.lastRunStatus !== "FAILED") {
    throw new Error("Dashboard analysis status is invalid");
  }
  return {
    trend: parseTrend(snapshot.trend),
    lastSucceededAt: snapshot.lastSucceededAt,
    lastRunStatus: snapshot.lastRunStatus,
    stale: snapshot.lastRunStatus === "FAILED" || snapshot.lastSucceededAt < latestExpectedAnalysisRun(now)
  };
}

// Stage 3's button can call this server-only entry point. Cron calls the same SQL
// function directly, and no privileged database key is ever sent to a browser.
export async function refreshDashboardAnalysisManually() {
  const user = await requireCurrentUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    throw new Error("Only Admin and Manager can refresh dashboard analysis");
  }
  const [result] = await prisma.$queryRaw<{ runId: bigint }[]>`
    SELECT dashboard_private.refresh_dashboard_analysis('MANUAL', ${user.id}) AS "runId"
  `;
  if (!result) throw new Error("Dashboard analysis did not return a run ID");
  const run = await prisma.dashboardAnalysisRun.findUnique({
    where: { id: result.runId },
    select: { id: true, status: true }
  });
  if (!run || run.status !== "SUCCEEDED") {
    throw new Error(run?.status === "SKIPPED"
      ? "Dashboard analysis is already running"
      : "Dashboard analysis failed; the last successful result is still available");
  }
  return run.id;
}
