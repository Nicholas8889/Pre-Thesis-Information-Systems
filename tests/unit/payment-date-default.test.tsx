import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({ recordPayment: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireCurrentUser: async () => ({id: "admin", role: "ADMIN", status: "Active"})
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  invoice: {findMany: async () => [{
    id: "invoice", invoiceNumber: "INV-TEST", customer: {companyName: "Test"},
    totalAmount: 100000, paidAmount: 0, remainingAmount: 100000, status: "Unpaid",
    dueDate: new Date("2027-12-31T00:00:00Z"), paymentTermType: "IMMEDIATE"
  }], findFirst: async () => null},
  payment: {findMany: async () => []}
} }));

import PaymentsPage from "../../src/app/payments/page";
import { PaymentForm } from "../../src/components/payment-form";

function paymentFormDate(node: ReactNode): string | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{children?: ReactNode; today?: string}>(child)) continue;
    if (child.type === PaymentForm) return child.props.today;
    const result = paymentFormDate(child.props.children);
    if (result) return result;
  }
}

afterEach(() => vi.useRealTimers());

describe("payment page default business date", () => {
  it.each([
    ["2026-10-15T16:59:59.999Z", "2026-10-15"],
    ["2026-10-15T17:00:00.000Z", "2026-10-16"],
    ["2026-10-15T17:31:32.513Z", "2026-10-16"],
    ["2026-10-15T23:59:59.999Z", "2026-10-16"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01"]
  ])("uses WIB at %s", async (instant, expected) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(instant));
    expect(paymentFormDate(await PaymentsPage({}))).toBe(expected);
  });
});
