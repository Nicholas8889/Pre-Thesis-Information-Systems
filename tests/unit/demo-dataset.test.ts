import { describe, expect, it } from "vitest";
import { buildDemoDataset, verifyDemoDataset, type DemoAccounts } from "../../prisma/demo/dataset";

const accounts: DemoAccounts = {
  admin: { id: "admin", username: "admin", displayName: "Admin", role: "ADMIN" },
  sales: { id: "sales", username: "sales", displayName: "Sales", role: "SALES" },
  manager: { id: "manager", username: "manager", displayName: "Manager", role: "MANAGER" }
};

describe("UMKM demo baseline", () => {
  it.each(["2026-10-04", "2027-01-01", "2026-03-31", "2028-02-29"])("keeps financial and date invariants at %s", date => {
    const dataset = buildDemoDataset(accounts, date);
    const summary = verifyDemoDataset(dataset);
    expect(summary.invoiceStatuses).toEqual({ Paid: 14, Partial: 4, Unpaid: 3, Overdue: 3 });
    expect(summary.paidInvoiceValue + summary.outstandingInvoiceValue).toBe(summary.totalInvoiceValue);
    expect(summary.pendingApprovals).toBe(2);
    expect(dataset.tables.delivery_note_sources.length).toBeGreaterThan(dataset.tables.delivery_notes.length);
    expect(dataset.tables.customers.every(row => row.portfolio_owner_user_id === "sales")).toBe(true);
    expect(dataset.documents.every(doc => dataset.tables.sales_orders.some(row => row.id === doc.orderId && row.customer_po_number === doc.number))).toBe(true);
    expect(new Set(dataset.tables.sales_orders.map(row => row.order_number)).size).toBe(30);
    const months = new Set(dataset.tables.sales_orders.map(row => String(row.order_date).slice(0, 7)));
    expect(months.size).toBe(6);
  });

  it("rejects a mismatched payment instead of publishing an inconsistent baseline", () => {
    const dataset = buildDemoDataset(accounts, "2026-10-04");
    dataset.tables.payments[0].amount = Number(dataset.tables.payments[0].amount) + 1;
    expect(() => verifyDemoDataset(dataset)).toThrow("payment balance mismatch");
  });

  it("rejects a pending order without delivered outstanding evidence", () => {
    const dataset = buildDemoDataset(accounts, "2026-10-04");
    dataset.tables.delivery_notes.forEach(note => { note.status = "Draft"; });
    expect(() => verifyDemoDataset(dataset)).toThrow("pending order has no delivered outstanding evidence");
  });
});
