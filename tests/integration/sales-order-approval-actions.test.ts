import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createCollectionTask: vi.fn(),
  createInvoice: vi.fn(),
  findInvoices: vi.fn(),
  findSalesOrder: vi.fn(),
  findSalesOrders: vi.fn(),
  findUpdatedSalesOrder: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  requireCurrentUser: vi.fn(),
  transaction: vi.fn(),
  updateManySalesOrders: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/session", () => ({
  requireCurrentUser: mocks.requireCurrentUser
}));

vi.mock("@/lib/audit", () => ({
  createAuditTrailLog: mocks.audit
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    collectionTask: {
      create: mocks.createCollectionTask
    },
    invoice: {
      findMany: mocks.findInvoices
    },
    salesOrder: {
      findUnique: mocks.findSalesOrder,
      findMany: mocks.findSalesOrders
    }
  }
}));

import { decideSalesOrderApproval, generateInvoice } from "../../src/lib/actions";

const pendingCustomerPo = {
  id: "customer-po-1",
  orderNumber: "SO-2026-001",
  customerId: "customer-1",
  source: "CUSTOMER_PO",
  status: "Draft",
  approvalStatus: "Pending",
  invoice: null,
  customer: { companyName: "Acme Indonesia" },
  notes: null,
  total: 125_000,
  paymentTermType: "IMMEDIATE",
  creditTermMonths: null,
  customerNpwpSnapshot: null,
  ppnApplied: false,
  ppnRateBasisPoints: 0,
  ppnAmount: 0,
  netSalesAmount: 125_000
};

describe("Customer PO approval actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({
      id: "manager-1",
      role: "MANAGER",
      status: "Active"
    });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    mocks.findInvoices.mockResolvedValue([]);
    mocks.findSalesOrders.mockResolvedValue([]);
    mocks.updateManySalesOrders.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(
      async (
        operation: (tx: {
          collectionTask: { create: typeof mocks.createCollectionTask };
          invoice: { create: typeof mocks.createInvoice };
          salesOrder: {
            findUniqueOrThrow: typeof mocks.findUpdatedSalesOrder;
            updateMany: typeof mocks.updateManySalesOrders;
          };
        }) => Promise<unknown>
      ) =>
        operation({
          collectionTask: { create: mocks.createCollectionTask },
          invoice: { create: mocks.createInvoice },
          salesOrder: {
            findUniqueOrThrow: mocks.findUpdatedSalesOrder,
            updateMany: mocks.updateManySalesOrders
          }
        })
    );
  });

  it("requires a non-whitespace reason before rejecting an order", async () => {
    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("decisionNote", "   ");
    formData.set("returnPath", "/customer-purchase-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&error=A%20rejection%20reason%20is%20required"
    );
    expect(mocks.findSalesOrder).not.toHaveBeenCalled();
    expect(mocks.updateManySalesOrders).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("uses the persisted Customer PO source and saves a noted rejection", async () => {
    const rejectionReason = "Customer must settle the overdue balance first";
    const rejectedCustomerPo = {
      ...pendingCustomerPo,
      status: "Cancelled",
      approvalStatus: "Rejected",
      approvalDecisionNote: rejectionReason
    };
    mocks.findSalesOrder.mockResolvedValue(pendingCustomerPo);
    mocks.findUpdatedSalesOrder.mockResolvedValue(rejectedCustomerPo);

    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("decisionNote", rejectionReason);
    formData.set("returnPath", "/sales-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&success=Customer%20PO%20rejected"
    );
    expect(mocks.updateManySalesOrders).toHaveBeenCalledWith({
      where: {
        id: pendingCustomerPo.id,
        approvalStatus: "Pending"
      },
      data: expect.objectContaining({
        status: "Cancelled",
        approvalStatus: "Rejected",
        approvalDecisionNote: rejectionReason,
        approvalDecidedById: "manager-1"
      })
    });
    expect(
      mocks.updateManySalesOrders.mock.calls[0][0].data.approvalDecidedAt
    ).toBeInstanceOf(Date);
    expect(mocks.findUpdatedSalesOrder).toHaveBeenCalledWith({
      where: { id: pendingCustomerPo.id }
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Customer Purchase Orders",
        entityType: "SALES_ORDER",
        entityId: pendingCustomerPo.id,
        action: "REJECTED",
        newValue: expect.objectContaining({
          status: "Cancelled",
          approvalStatus: "Rejected",
          decisionNote: rejectionReason
        })
      })
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("prevents a later decision from overwriting an already claimed approval", async () => {
    mocks.findSalesOrder.mockResolvedValue(pendingCustomerPo);
    mocks.updateManySalesOrders.mockResolvedValue({ count: 0 });

    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("decisionNote", "Customer credit must be reviewed");
    formData.set("returnPath", "/customer-purchase-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&error=This%20sales%20order%20is%20no%20longer%20waiting%20for%20approval"
    );
    expect(mocks.findUpdatedSalesOrder).not.toHaveBeenCalled();
    expect(mocks.createInvoice).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("approves a Customer PO and generates exactly one invoice atomically", async () => {
    const approvedCustomerPo = {
      ...pendingCustomerPo,
      status: "Invoiced",
      approvalStatus: "Approved",
      approvalDecisionNote: null
    };
    mocks.findSalesOrder.mockResolvedValue(pendingCustomerPo);
    mocks.findUpdatedSalesOrder.mockResolvedValue(approvedCustomerPo);
    mocks.createInvoice.mockImplementation(async ({ data }) => ({
      id: "invoice-1",
      ...data
    }));

    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Approved");
    formData.set("returnPath", "/sales-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&success=Customer%20PO%20approved%20and%20invoice%20generated"
    );
    expect(mocks.updateManySalesOrders).toHaveBeenCalledWith({
      where: {
        id: pendingCustomerPo.id,
        approvalStatus: "Pending"
      },
      data: expect.objectContaining({
        status: "Invoiced",
        approvalStatus: "Approved",
        approvalDecidedById: "manager-1"
      })
    });
    expect(mocks.createInvoice).toHaveBeenCalledTimes(1);
    expect(mocks.createInvoice).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salesOrderId: pendingCustomerPo.id,
        customerId: pendingCustomerPo.customerId,
        totalAmount: pendingCustomerPo.total,
        status: "Unpaid"
      })
    });
    expect(mocks.createCollectionTask).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Customer Purchase Orders",
        action: "APPROVED"
      })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Invoices",
        action: "CREATED"
      })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleName: "Receivables",
        action: "CREATED"
      })
    );
  });

  it.each([
    [
      "Pending",
      "Manager%20approval%20is%20required%20before%20an%20invoice%20can%20be%20generated"
    ],
    ["Rejected", "A%20rejected%20sales%20order%20cannot%20generate%20an%20invoice"]
  ] as const)(
    "blocks invoice generation for a %s Customer PO",
    async (approvalStatus, encodedMessage) => {
      mocks.findSalesOrder.mockResolvedValue({
        ...pendingCustomerPo,
        approvalStatus
      });

      const formData = new FormData();
      formData.set("salesOrderId", pendingCustomerPo.id);

      await expect(generateInvoice(formData)).rejects.toThrow(
        `NEXT_REDIRECT:/customer-purchase-orders?tab=approval&error=${encodedMessage}`
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.updateManySalesOrders).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );
});
