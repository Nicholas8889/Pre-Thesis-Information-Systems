import { config } from "dotenv";
import { PrismaClient, type UserRole } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { signSession } from "../src/lib/session-token";

config({ path: ".env.local" });
config();

type TestUser = { id: string; username: string; role: UserRole };
const db = new PrismaClient();
let admin: TestUser;
let manager: TestUser;
let sales: TestUser[];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    throw new Error("Browser dashboard tests need AUTH_SECRET and DATABASE_URL");
  }
  const users = await db.user.findMany({
    where: { status: "Active", role: { in: ["ADMIN", "MANAGER", "SALES"] } },
    select: { id: true, username: true, role: true }
  });
  admin = users.find((user) => user.role === "ADMIN")!;
  manager = users.find((user) => user.role === "MANAGER")!;
  sales = users.filter((user) => user.role === "SALES");
  if (!admin || !manager || sales.length < 2) {
    throw new Error("Browser dashboard tests need an active Admin, Manager, and two Sales users");
  }
});

test.afterAll(async () => { await db.$disconnect(); });

async function authenticate(page: Page, user: TestUser) {
  const token = await signSession({
    userId: user.id, username: user.username, role: user.role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  await page.context().addCookies([{
    name: "cv_tajuk_session", value: token, url: "http://127.0.0.1:3107",
    httpOnly: true, sameSite: "Lax"
  }]);
  await page.goto("/");
}

test("TC-04/05: two Sales dashboards are private and have no refresh button", async ({ page }) => {
  for (const user of sales.slice(0, 2)) {
    await authenticate(page, user);
    await expect(page.getByRole("heading", { name: "Sales Dashboard" })).toBeVisible();
    await expect(page.getByText("Your portfolio", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Perbarui Analisis" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "My Revenue Trend" })).toBeVisible();
  }
  await authenticate(page, manager);
  await expect(page.getByRole("heading", { name: "Manager Dashboard" })).toBeVisible();
  await expect(page.getByText("Company-wide", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Perbarui Analisis" })).toBeVisible();
});

test("TC-05: a direct Sales form POST is denied by the server action", async ({ page }) => {
  await authenticate(page, manager);
  await expect(page.getByRole("heading", { name: "Manager Dashboard" })).toBeVisible();
  const fields = await page.locator('form[data-no-action-confirmation="true"]').filter({ hasText: "Perbarui Analisis" }).evaluate((form) =>
    Array.from(new FormData(form as HTMLFormElement), ([name, value]) => [name, String(value)] as const)
  );
  expect(fields.some(([name]) => name.startsWith("$ACTION_"))).toBe(true);
  const before = await db.dashboardAnalysisRun.count({ where: { triggerSource: "MANUAL" } });
  await authenticate(page, sales[0]);
  const response = await page.request.post("/", {
    multipart: Object.fromEntries(fields), headers: { Accept: "text/html" }
  });
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("Anda tidak berhak memperbarui analisis.");
  expect(await db.dashboardAnalysisRun.count({ where: { triggerSource: "MANUAL" } })).toBe(before);
});
for (const role of ["ADMIN", "MANAGER"] as const) {
  test(`TC-06: ${role} sees loading, success, and new timestamp`, async ({ page }) => {
    const user = role === "ADMIN" ? admin : manager;
    await authenticate(page, user);
    const before = await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        await held;
      }
      await route.continue();
    });
    try {
      await page.getByRole("button", { name: "Perbarui Analisis" }).click();
      await expect(page.getByRole("button", { name: "Memperbarui Analisis…" })).toBeDisabled();
      await expect(page.getByText("Menghitung ringkasan dashboard…")).toBeVisible();
    } finally {
      release();
    }
    await expect(page.getByText("Analisis berhasil diperbarui.")).toBeVisible();
    if (role === "MANAGER") {
      await expect(page.getByRole("img", { name: "Revenue trend chart" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: /Invoice Insight/ })).toBeVisible();
    }
    await expect(page.getByText(/^Diperbarui .* WIB$/)).toBeVisible();
    const after = await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
    expect(after.lastSucceededAt.getTime()).toBeGreaterThan(before.lastSucceededAt.getTime());
    expect(after.lastRunStatus).toBe("SUCCEEDED");
  });
}

test("TC-07/08: concurrent manual refresh gives error feedback and keeps previous chart", async ({ page }) => {
  await authenticate(page, manager);
  const before = await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
  const rollback = new Error("release dashboard lock");
  await expect(db.$transaction(async (holder) => {
    await holder.$executeRawUnsafe("SELECT pg_advisory_xact_lock(824219, 1424)");
    await page.getByRole("button", { name: "Perbarui Analisis" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Analisis sedang dihitung oleh proses lain" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Revenue trend chart" })).toBeVisible();
    throw rollback;
  }, { timeout: 60_000 })).rejects.toBe(rollback);
  const after = await db.dashboardAnalysisSnapshot.findUniqueOrThrow({ where: { scopeKey: "company" } });
  expect(after.lastSucceededAt).toEqual(before.lastSucceededAt);
  expect(after.trend).toEqual(before.trend);
});
