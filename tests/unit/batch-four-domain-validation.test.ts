import { describe, expect, it } from "vitest";
import {
  ACTIVE_DELIVERY_ASSIGNMENTS,
  validateDeliveryAssignment
} from "../../src/lib/delivery-options";
import {
  MAX_PACKAGE_COUNT,
  parsePackageCount
} from "../../src/lib/package-count";

describe("Batch 4 boundary and domain validation", () => {
  it.each(["", "0", "-1", "1.5", "text", " 1 ", "2147483648"])(
    "rejects required package count %j without loose coercion",
    value => {
      expect(parsePackageCount(value, { required: true })).toEqual({
        valid: false,
        value: null
      });
    }
  );

  it.each(["1", "1000", String(MAX_PACKAGE_COUNT)])(
    "accepts positive package count %s within PostgreSQL Int range",
    value => {
      expect(parsePackageCount(value, { required: true })).toEqual({
        valid: true,
        value: Number(value)
      });
    }
  );

  it("allows blank package count only while completion does not require it", () => {
    expect(parsePackageCount("", { required: false })).toEqual({
      valid: true,
      value: null
    });
  });

  it("accepts every active canonical assignment ID and snapshots its tuple", () => {
    for (const assignment of ACTIVE_DELIVERY_ASSIGNMENTS) {
      expect(validateDeliveryAssignment({ deliveryAssignmentId: assignment.id })).toEqual({
        valid: true,
        value: {
          driverName: assignment.driverName,
          vehiclePlateNumber: assignment.vehiclePlateNumber
        },
        errors: {}
      });
    }
  });

  it.each([
    { deliveryAssignmentId: "retired-driver-b9999" },
    { deliveryAssignmentId: "unknown-assignment" },
    { deliveryAssignmentId: " budi-b1234 " },
    { driverName: "Budi Santoso", vehiclePlateNumber: "B 5678 CVT" },
    { driverName: "budi santoso", vehiclePlateNumber: "B 1234 TJK" },
    { driverName: "Budi Santoso", vehiclePlateNumber: " B 1234 TJK " },
    { driverName: "Arbitrary", vehiclePlateNumber: "B 0000 XXX" }
  ])("rejects inactive, cross-pair, arbitrary, casing, or whitespace assignment %#", input => {
    expect(validateDeliveryAssignment(input)).toMatchObject({ valid: false, value: null });
  });
});
