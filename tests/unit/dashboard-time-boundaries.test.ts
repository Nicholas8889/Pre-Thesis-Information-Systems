import { describe, expect, it } from "vitest";
import { latestExpectedAnalysisRun } from "@/lib/dashboard-analysis";

describe("TC-10/12 dashboard WIB cron boundaries", () => {
  it.each([
    ["2026-12-31T17:14:59Z", "2026-12-30T17:15:00.000Z"],
    ["2026-12-31T17:15:00Z", "2026-12-30T17:15:00.000Z"],
    ["2026-12-31T17:29:59Z", "2026-12-30T17:15:00.000Z"],
    ["2026-12-31T17:30:00Z", "2026-12-31T17:15:00.000Z"],
    ["2027-01-01T17:29:59Z", "2026-12-31T17:15:00.000Z"],
    ["2027-01-01T17:30:00Z", "2027-01-01T17:15:00.000Z"],
    ["2027-02-28T17:30:00Z", "2027-02-28T17:15:00.000Z"]
  ])("requires %s for clock %s", (now, expected) => {
    expect(latestExpectedAnalysisRun(new Date(now)).toISOString()).toBe(expected);
  });
});
