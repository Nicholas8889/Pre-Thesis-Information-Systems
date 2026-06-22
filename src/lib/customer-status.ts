import type { CustomerStatus } from "@prisma/client";

export function getOppositeCustomerStatus(status: CustomerStatus): CustomerStatus {
  return status === "Active" ? "Inactive" : "Active";
}
