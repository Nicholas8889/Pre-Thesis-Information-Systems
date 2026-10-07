import { describe, expect, it } from "vitest";

import {
  buildCompletedPickingWhere,
  completedPickingHref,
  parseCompletedPickingFilters,
} from "../../src/lib/pick-pack-query";

describe("completed Pick & Pack query", () => {
  it("normalizes untrusted filters and drops invalid calendar dates", () => {
    expect(
      parseCompletedPickingFilters({
        q: "  ACME  ",
        fulfillment: "invalid",
        deliveryStatus: "invalid",
        from: "2026-02-31",
        to: "2026-09-27",
      }),
    ).toEqual({
      query: "ACME",
      pic: "",
      from: "",
      to: "2026-09-27",
      deliveryStatus: "all",
    });
  });

  it("uses one PIC filter for checklist and historical personnel without shortage filtering", () => {
    const filters = parseCompletedPickingFilters({
      q: "PO-42",
      pic: "Dewi",
      fulfillment: "shortage",
      from: "2026-09-01",
      to: "2026-09-27",
      deliveryStatus: "delivered",
    });
    const where = buildCompletedPickingWhere(
      { salesOrder: { createdByUserId: "sales-1" } },
      filters,
    );

    expect(where.AND).toEqual(
      expect.arrayContaining([
        { salesOrder: { createdByUserId: "sales-1" } },
        { status: "Packed" },
        {
          OR: [
            { pickerName: { contains: "Dewi" } },
            { usesChecklist: false, packerName: { contains: "Dewi" } },
          ],
        },
      ]),
    );
    expect(JSON.stringify(where)).toContain("PO-42");
    expect(JSON.stringify(where)).toContain("Delivered");
    expect(JSON.stringify(where)).toContain("packedAt");
    expect(JSON.stringify(where)).not.toContain("availabilityStatus");
  });

  it("preserves only canonical filters when opening a completed record", () => {
    const filters = parseCompletedPickingFilters({
      tab: "completed",
      q: "PL-9",
      fulfillment: "full",
      deliveryStatus: "not-issued",
    });

    expect(completedPickingHref(filters, "pick-9")).toBe(
      "/pick-pack?tab=completed&q=PL-9&deliveryStatus=not-issued&view=pick-9",
    );
  });
  it("canonicalizes old PIC bookmarks and ignores obsolete shortage parameters", () => {
    const filters = parseCompletedPickingFilters({ packer: " Raka ", fulfillment: "shortage" });
    expect(filters.pic).toBe("Raka");
    expect(completedPickingHref(filters)).toBe("/pick-pack?tab=completed&pic=Raka");
  });
});
