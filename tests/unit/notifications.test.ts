import { describe, expect, it } from "vitest";
import {
  isCollectionDeadlineNotification,
  isCustomerPoProcessingNotification,
  needsCustomerOutreach
} from "../../src/lib/notification-rules";
import { getUnreadNotificationIds } from "../../src/lib/notification-state";

describe("notification rules", () => {
  const now = new Date("2026-06-19T17:30:00.000Z"); // 20 Jun 2026 WIB

  it("notifies Admin for planned Collections deadlines within seven days or overdue", () => {
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-06-27T00:00:00+07:00") },
        now
      )
    ).toBe(true);
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-06-01T00:00:00+07:00") },
        now
      )
    ).toBe(true);
    expect(
      isCollectionDeadlineNotification(
        { status: "Planned", deadline: new Date("2026-06-28T00:00:00+07:00") },
        now
      )
    ).toBe(false);
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
    expect(needsCustomerOutreach(new Date("2026-03-20T00:00:00+07:00"), now)).toBe(true);
    expect(needsCustomerOutreach(new Date("2026-03-21T00:00:00+07:00"), now)).toBe(false);
    expect(
      needsCustomerOutreach(
        new Date("2026-02-28T00:00:00+07:00"),
        new Date("2026-05-31T18:00:00.000Z")
      )
    ).toBe(true);
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
          requiredDate: new Date("2026-06-27T00:00:00+07:00"),
          status: "Confirmed",
          hasDeliveredDocument: false
        },
        now
      )
    ).toBe(true);
    expect(
      isCustomerPoProcessingNotification(
        {
          requiredDate: new Date("2026-06-28T00:00:00+07:00"),
          status: "Confirmed",
          hasDeliveredDocument: false
        },
        now
      )
    ).toBe(false);
    expect(
      isCustomerPoProcessingNotification(
        {
          requiredDate: new Date("2026-06-20T00:00:00+07:00"),
          status: "Cancelled",
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
