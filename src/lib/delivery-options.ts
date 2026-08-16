export const DELIVERY_DRIVER_OPTIONS = [
  "Budi Santoso",
  "Andi Pratama"
] as const;

export const DELIVERY_VEHICLE_PLATE_OPTIONS = [
  "B 1234 TJK",
  "B 5678 CVT"
] as const;

const allowedDrivers = new Set<string>(DELIVERY_DRIVER_OPTIONS);
const allowedVehiclePlates = new Set<string>(DELIVERY_VEHICLE_PLATE_OPTIONS);

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
  driverName,
  vehiclePlateNumber
}: {
  driverName: unknown;
  vehiclePlateNumber: unknown;
}): DeliveryAssignmentResult {
  const normalizedDriverName = normalizeOption(driverName);
  const normalizedVehiclePlateNumber = normalizeOption(vehiclePlateNumber);
  const errors: Partial<Record<keyof DeliveryAssignment, string>> = {};

  if (!allowedDrivers.has(normalizedDriverName)) {
    errors.driverName = normalizedDriverName
      ? "Select a valid driver"
      : "Select a driver";
  }

  if (!allowedVehiclePlates.has(normalizedVehiclePlateNumber)) {
    errors.vehiclePlateNumber = normalizedVehiclePlateNumber
      ? "Select a valid vehicle plate"
      : "Select a vehicle plate";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, value: null, errors };
  }

  return {
    valid: true,
    value: {
      driverName: normalizedDriverName,
      vehiclePlateNumber: normalizedVehiclePlateNumber
    },
    errors: {}
  };
}

function normalizeOption(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
