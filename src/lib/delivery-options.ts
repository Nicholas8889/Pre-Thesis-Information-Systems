export const DELIVERY_ASSIGNMENTS = [
  {
    id: "budi-b1234",
    driverName: "Budi Santoso",
    vehiclePlateNumber: "B 1234 TJK",
    active: true
  },
  {
    id: "andi-b5678",
    driverName: "Andi Pratama",
    vehiclePlateNumber: "B 5678 CVT",
    active: true
  },
  {
    id: "retired-driver-b9999",
    driverName: "Retired Driver",
    vehiclePlateNumber: "B 9999 OLD",
    active: false
  }
] as const;

export const ACTIVE_DELIVERY_ASSIGNMENTS = DELIVERY_ASSIGNMENTS.filter(
  assignment => assignment.active
);

export const DELIVERY_DRIVER_OPTIONS = ACTIVE_DELIVERY_ASSIGNMENTS.map(
  assignment => assignment.driverName
);

export const DELIVERY_VEHICLE_PLATE_OPTIONS = ACTIVE_DELIVERY_ASSIGNMENTS.map(
  assignment => assignment.vehiclePlateNumber
);

export type DeliveryAssignment = {
  driverName: string;
  vehiclePlateNumber: string;
};

export type DeliveryAssignmentResult =
  | { valid: true; value: DeliveryAssignment; errors: Record<string, never> }
  | {
      valid: false;
      value: null;
      errors: Partial<Record<keyof DeliveryAssignment, string>>;
    };

export function validateDeliveryAssignment({
  deliveryAssignmentId,
  driverName,
  vehiclePlateNumber
}: {
  deliveryAssignmentId?: unknown;
  driverName?: unknown;
  vehiclePlateNumber?: unknown;
}): DeliveryAssignmentResult {
  const assignmentId = typeof deliveryAssignmentId === "string"
    ? deliveryAssignmentId
    : "";
  const submittedDriver = typeof driverName === "string" ? driverName : "";
  const submittedPlate = typeof vehiclePlateNumber === "string"
    ? vehiclePlateNumber
    : "";
  const assignment = assignmentId
    ? DELIVERY_ASSIGNMENTS.find(candidate => candidate.id === assignmentId)
    : DELIVERY_ASSIGNMENTS.find(candidate =>
        candidate.driverName === submittedDriver &&
        candidate.vehiclePlateNumber === submittedPlate
      );

  if (
    !assignment ||
    !assignment.active ||
    (assignmentId && submittedDriver && submittedDriver !== assignment.driverName) ||
    (assignmentId && submittedPlate && submittedPlate !== assignment.vehiclePlateNumber)
  ) {
    return {
      valid: false,
      value: null,
      errors: {
        driverName: "Select an active driver and vehicle assignment",
        vehiclePlateNumber: "Select an active driver and vehicle assignment"
      }
    };
  }

  return {
    valid: true,
    value: {
      driverName: assignment.driverName,
      vehiclePlateNumber: assignment.vehiclePlateNumber
    },
    errors: {}
  };
}

export function getDeliveryAssignmentId(
  driverName: string | null | undefined,
  vehiclePlateNumber: string | null | undefined
) {
  return DELIVERY_ASSIGNMENTS.find(assignment =>
    assignment.driverName === driverName &&
    assignment.vehiclePlateNumber === vehiclePlateNumber
  )?.id ?? null;
}
