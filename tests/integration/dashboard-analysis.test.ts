import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";

config({ path: ".env.local" });
config();

const runAgainstDatabase = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const db = runAgainstDatabase ? new PrismaClient() : null;

afterAll(async () => {
  await db?.$disconnect();
});

type DashboardUser = { id: string; role: UserRole };

function monthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit"
  }).formatToParts(date);
  return parts.find((part) => part.type === "year")?.value + "-" +
    parts.find((part) => part.type === "month")?.value;
}

async function expectedTrend(user: DashboardUser, now: Date) {
  if (!db) throw new Error("Database is not configured");
  const ownerId = user.role === "SALES" ? user.id : null;
  const [orders, payments] = await Promise.all([
    db.salesOrder.findMany({
      where: ownerId ? { createdByUserId: ownerId } : undefined,
      select: { orderDate: true, total: true }
    }),
    db.payment.findMany({
      where: ownerId ? { invoice: { salesOrder: { createdByUserId: ownerId } } } : undefined,
      select: { paymentDate: true, amount: true }
    })
  ]);
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  const year = Number(nowParts.find((part) => part.type === "year")?.value);
  const month = Number(nowParts.find((part) => part.type === "month")?.value) - 1;
  const points = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 5 + index, 1));
    return {
      key: monthKey(date),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      sales: 0,
      payments: 0
    };
  });
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const order of orders) {
    const point = byKey.get(monthKey(order.orderDate));
    if (point) point.sales += order.total;
  }
  for (const payment of payments) {
    const point = byKey.get(monthKey(payment.paymentDate));
    if (point) point.payments += payment.amount;
  }
  return points.map(({ label, sales, payments }) => ({ label, sales, payments }));
}

describe.skipIf(!runAgainstDatabase)("dashboard historical analysis against Supabase", () => {
  it("computes the same six-month trend for company and each Sales portfolio with one manual process", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    const users = await db.user.findMany({
      where: { status: "Active", role: { in: ["ADMIN", "MANAGER", "SALES"] } },
      select: { id: true, role: true }
    });
    const admin = users.find((user) => user.role === "ADMIN");
    const manager = users.find((user) => user.role === "MANAGER");
    const sales = users.filter((user) => user.role === "SALES");
    expect(admin).toBeDefined();
    expect(manager).toBeDefined();
    expect(sales.length).toBeGreaterThanOrEqual(2);
    if (!admin || !manager || sales.length < 2) return;

    const rollback = new Error("rollback dashboard analysis test");
    await expect(db.$transaction(async (tx) => {
      const [result] = await tx.$queryRaw<{ runId: bigint }[]>`
        SELECT dashboard_private.refresh_dashboard_analysis('MANUAL', ${admin.id}) AS "runId"
      `;
      const run = await tx.dashboardAnalysisRun.findUniqueOrThrow({ where: { id: result.runId } });
      expect(run).toMatchObject({ triggerSource: "MANUAL", actorUserId: admin.id, status: "SUCCEEDED" });
      expect(run.finishedAt).not.toBeNull();

      const company = await getDashboardAnalysis(admin, run.finishedAt ?? new Date(), tx);
      expect(company.lastRunStatus).toBe("SUCCEEDED");
      expect(company.lastSucceededAt).not.toBeNull();
      expect(company.trend).toEqual(await expectedTrend(admin, run.finishedAt ?? new Date()));
      expect((await getDashboardAnalysis(manager, run.finishedAt ?? new Date(), tx)).trend)
        .toEqual(company.trend);

      for (const user of sales) {
        const own = await getDashboardAnalysis(user, run.finishedAt ?? new Date(), tx);
        expect(own.trend).toEqual(await expectedTrend(user, run.finishedAt ?? new Date()));
        const row = await tx.dashboardAnalysisSnapshot.findUniqueOrThrow({
          where: { scopeKey: "sales:" + user.id }
        });
        expect(row).toMatchObject({ scopeType: "SALES", ownerUserId: user.id, lastRunStatus: "SUCCEEDED" });
      }
      expect(await tx.dashboardAnalysisSnapshot.count({
        where: { scopeKey: { in: ["company", ...sales.map((user) => "sales:" + user.id)] } }
      })).toBe(sales.length + 1);
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);
  }, 120000);

  it("records a failed calculation while preserving the last successful trend and timestamp", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    const user = await db.user.findFirstOrThrow({
      where: { role: "MANAGER", status: "Active" },
      select: { id: true, role: true }
    });
    const before = await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
    const rollback = new Error("rollback failed analysis test");
    await expect(db.$transaction(async (tx) => {
      const [result] = await tx.$queryRaw<{ runId: bigint }[]>`
        SELECT dashboard_private.refresh_dashboard_analysis('TEST_FAILURE', NULL) AS "runId"
      `;
      const run = await tx.dashboardAnalysisRun.findUniqueOrThrow({ where: { id: result.runId } });
      expect(run.status).toBe("FAILED");
      expect(run.errorMessage).toContain("Unsupported dashboard analysis trigger");
      const after = await tx.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
      expect(after.trend).toEqual(before.trend);
      expect(after.lastSucceededAt).toEqual(before.lastSucceededAt);
      expect(after.lastRunStatus).toBe("FAILED");
      expect(after.lastAttemptAt.getTime()).toBeGreaterThanOrEqual(before.lastAttemptAt.getTime());
      const visible = await getDashboardAnalysis(user, new Date(), tx);
      expect(visible.trend).toEqual(before.trend);
      expect(visible.lastSucceededAt).toEqual(before.lastSucceededAt);
      expect(visible.stale).toBe(true);
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);

    expect(await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } }))
      .toMatchObject({ trend: before.trend, lastSucceededAt: before.lastSucceededAt, lastRunStatus: before.lastRunStatus });
  }, 120000);

  it("keeps every successful snapshot when nightly and manual calculations fail after starting", async () => {
    if (!db) throw new Error("Database is not configured");
    const { getDashboardAnalysis } = await import("@/lib/dashboard-analysis");
    const admin = await db.user.findFirstOrThrow({
      where: { role: "ADMIN", status: "Active" },
      select: { id: true, role: true }
    });
    const before = await db.dashboardAnalysisSnapshot.findMany();
    const rollback = new Error("rollback forced dashboard analysis failures");

    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "CREATE FUNCTION dashboard_private.dashboard_analysis_test_fail() " +
        "RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' " +
        "AS $test$ BEGIN IF NEW.scope_key = 'company' AND NEW.last_run_status = 'SUCCEEDED' " +
        "THEN RAISE EXCEPTION 'Forced dashboard calculation failure'; END IF; " +
        "RETURN NEW; END; $test$"
      );
      await tx.$executeRawUnsafe(
        "CREATE TRIGGER dashboard_analysis_test_failure BEFORE INSERT OR UPDATE " +
        "ON public.dashboard_analysis_snapshots FOR EACH ROW " +
        "EXECUTE FUNCTION dashboard_private.dashboard_analysis_test_fail()"
      );

      for (const source of ["NIGHTLY", "MANUAL"] as const) {
        const [result] = await tx.$queryRawUnsafe<{ runId: bigint }[]>(
          'SELECT dashboard_private.refresh_dashboard_analysis($1::text, $2::text) AS "runId"',
          source, source === "MANUAL" ? admin.id : null
        );
        const run = await tx.dashboardAnalysisRun.findUniqueOrThrow({ where: { id: result.runId } });
        expect(run).toMatchObject({
          triggerSource: source, status: "FAILED",
          actorUserId: source === "MANUAL" ? admin.id : null
        });
        expect(run.errorMessage).toContain("Forced dashboard calculation failure");
        const after = await tx.dashboardAnalysisSnapshot.findMany();
        expect(after.length).toBe(before.length);
        for (const old of before) {
          const current = after.find((row) => row.scopeKey === old.scopeKey);
          expect(current).toBeDefined();
          expect(current?.trend).toEqual(old.trend);
          expect(current?.lastSucceededAt).toEqual(old.lastSucceededAt);
          expect(current?.lastRunStatus).toBe("FAILED");
        }
        const visible = await getDashboardAnalysis(admin, new Date(), tx);
        expect(visible.stale).toBe(true);
        expect(visible.trend).toEqual(before.find((row) => row.scopeKey === "company")?.trend);
      }
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);

    expect(await db.dashboardAnalysisSnapshot.findMany()).toEqual(before);
  }, 120000);

  it("skips a second manual run while the first process holds its database lock", async () => {
    if (!db) throw new Error("Database is not configured");
    const admin = await db.user.findFirstOrThrow({
      where: { role: "ADMIN", status: "Active" },
      select: { id: true }
    });
    const rollbackOuter = new Error("rollback dashboard lock holder");
    const rollbackInner = new Error("rollback skipped dashboard run");

    await expect(db.$transaction(async (holder) => {
      await holder.$executeRawUnsafe("SELECT pg_advisory_xact_lock(824219, 1424)");
      await expect(db.$transaction(async (attempt) => {
        const [result] = await attempt.$queryRawUnsafe<{ runId: bigint }[]>(
          'SELECT dashboard_private.refresh_dashboard_analysis($1::text, $2::text) AS "runId"',
          "MANUAL", admin.id
        );
        const run = await attempt.dashboardAnalysisRun.findUniqueOrThrow({
          where: { id: result.runId }
        });
        expect(run.status).toBe("SKIPPED");
        expect(run.errorMessage).toContain("Another dashboard analysis run is in progress");
        throw rollbackInner;
      }, { timeout: 30000 })).rejects.toBe(rollbackInner);
      throw rollbackOuter;
    }, { timeout: 30000 })).rejects.toBe(rollbackOuter);
  }, 60000);

  it("denies Data API roles direct access to snapshots and run history", async () => {
    if (!db) throw new Error("Database is not configured");
    const [row] = await db.$queryRaw<{
      snapshotRls: boolean; runRls: boolean;
      anonSnapshotSelect: boolean; authenticatedSnapshotSelect: boolean;
      anonRunSelect: boolean; authenticatedRunSelect: boolean;
    }[]>`
      SELECT
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dashboard_analysis_snapshots'::regclass) AS "snapshotRls",
        (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.dashboard_analysis_runs'::regclass) AS "runRls",
        has_table_privilege('anon', 'public.dashboard_analysis_snapshots', 'SELECT') AS "anonSnapshotSelect",
        has_table_privilege('authenticated', 'public.dashboard_analysis_snapshots', 'SELECT') AS "authenticatedSnapshotSelect",
        has_table_privilege('anon', 'public.dashboard_analysis_runs', 'SELECT') AS "anonRunSelect",
        has_table_privilege('authenticated', 'public.dashboard_analysis_runs', 'SELECT') AS "authenticatedRunSelect"
    `;
    expect(row).toEqual({
      snapshotRls: true, runRls: true,
      anonSnapshotSelect: false, authenticatedSnapshotSelect: false,
      anonRunSelect: false, authenticatedRunSelect: false
    });
  });
});
