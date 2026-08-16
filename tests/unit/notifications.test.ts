import { describe, expect, it } from "vitest";
import {
  isCollectionDeadlineNotification,
  isCustomerPoProcessingNotification,
  needsCustomerOutreach
} from "../../src/lib/notification-rules";
import { getUnreadNotificationIds } from "../../src/lib/notification-state";

describe("notification rules", () => {
  const now = new Date("2026-06-19T12:00:00");

  it("notifies Admin for planned Collections deadlines within seven days or overdue", () => {
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-06-25") },
        now
      )
    ).toBe(true);
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-06-01") },
        now
      )
    ).toBe(true);
    expect(
      isCollectionDeadlineNotification(
        { status: "Done", deadline: new Date("2026-06-20") },
        now
      )
    ).toBe(false);
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-07-10") },
        now
      )
    ).toBe(false);
  });

  it("notifies Sales when the customer has no order in the last three months", () => {
    expect(needsCustomerOutreach(null, now)).toBe(true);
    expect(needsCustomerOutreach(new Date("2026-02-01"), now)).toBe(true);
    expect(needsCustomerOutreach(new Date("2026-05-01"), now)).toBe(false);
  });

  it("treats notification IDs not stored as read as unread", () => {
    const notifications = [{ id: "one" }, { id: "two" }];
    expect(getUnreadNotificationIds(notifications, ["one"])).toEqual(["two"]);
    expect(getUnreadNotificationIds(notifications, ["one", "two"])).toEqual([]);
  });

  it("reminds users to process active Customer Purchase Orders within seven days", () => {
    expect(
      isCustomerPoProcessingNotification(
        {
          requiredDate: new Date("2026-06-25"),
          status: "Confirmed",
          hasDeliveredDocument: false
        },
        now
      )
    ).toBe(true);
    expect(
      isCustomerPoProcessingNotification(
        {
          requiredDate: new Date("2026-07-10"),
          status: "Confirmed",
          hasDeliveredDocument: false
        },
        now
      )
    ).toBe(false);
    expect(
      isCustomerPoProcessingNotification(
        {
          requiredDate: new Date("2026-06-20"),
          status: "Invoiced",
          hasDeliveredDocument: true
        },
        now
      )
    ).toBe(false);
  });
});
