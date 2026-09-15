import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
config();
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";
const db = enabled ? new PrismaClient() : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!enabled)("TC-12 SQL trend months across a year boundary", () => {
  it("generates exactly six ordered monthly labels, including December to January", async () => {
    if (!db) throw new Error("Database is not configured");
    const points = await db.$queryRaw<{ key: string; label: string }[]>`
      SELECT to_char(month_start, 'YYYY-MM') AS key,
             to_char(month_start, 'Mon') AS label
      FROM generate_series(
        date_trunc('month', timestamp '2027-01-15') - interval '5 months',
        date_trunc('month', timestamp '2027-01-15'),
        interval '1 month'
      ) AS month_start
      ORDER BY month_start
    `;
    expect(points.map((point) => point.key)).toEqual([
      "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"
    ]);
    expect(points.map((point) => point.label)).toEqual([
      "Aug", "Sep", "Oct", "Nov", "Dec", "Jan"
    ]);
  });

  it("places a UTC event after 17:00 in the next WIB month", async () => {
    if (!db) throw new Error("Database is not configured");
    const [row] = await db.$queryRaw<{ monthKey: string }[]>`
      SELECT to_char(
        date_trunc('month', timestamp '2026-12-31 17:15:00' + interval '7 hours'),
        'YYYY-MM'
      ) AS "monthKey"
    `;
    expect(row.monthKey).toBe("2027-01");
  });
});
