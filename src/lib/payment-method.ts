import type { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHODS = ["Cash", "BankTransfer", "Other"] as const satisfies readonly PaymentMethod[];

export function parsePaymentMethod(value: FormDataEntryValue | null): PaymentMethod | null {
  if (typeof value !== "string") return null;
  return (PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as PaymentMethod)
    : null;
}
