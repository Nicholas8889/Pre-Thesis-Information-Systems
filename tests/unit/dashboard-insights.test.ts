import { describe, expect, it } from "vitest";
import { buildCustomerRelationshipSummary } from "@/lib/dashboard-insights";

describe("buildCustomerRelationshipSummary", () => {
  it("summarizes outreach and inquiry activity for the visible customer portfolio", () => {
    const summary = buildCustomerRelationshipSummary([
      {
        outreachActivities: [{ id: "outreach-1" }, { id: "outreach-2" }],
        inquiries: [{ status: "Open" }, { status: "Done" }],
        salesOrders: [{ status: "Confirmed" }]
      },
      {
        outreachActivities: [{ id: "outreach-3" }],
        inquiries: [{ status: "Closed" }, { status: "Cancelled" }],
        salesOrders: [{ status: "Cancelled" }]
      }
    ]);

    expect(summary).toEqual({
      totalOutreach: 3,
      outreachConverted: 1,
      totalInquiries: 4,
      openInquiries: 1,
      closedInquiries: 2
    });
  });

  it("returns zeroes for an empty portfolio", () => {
    expect(buildCustomerRelationshipSummary([])).toEqual({
      totalOutreach: 0,
      outreachConverted: 0,
      totalInquiries: 0,
      openInquiries: 0,
      closedInquiries: 0
    });
  });
});
