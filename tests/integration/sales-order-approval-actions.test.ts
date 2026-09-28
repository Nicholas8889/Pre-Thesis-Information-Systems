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
  sequence: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
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
    documentSequence: {
      upsert: mocks.sequence
    },
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
  version: 1,
  approvalStatus: "Pending",
  invoice: null,
  customer: {
    name: "Acme Contact",
    companyName: "Acme Indonesia",
    phone: "021",
    email: "acme@example.com",
    address: "Jakarta",
    status: "Active",
    invoices: []
  },
  items: [{
    itemName: "Widget",
    productSkuSnapshot: "W-1",
    quantity: 1,
    baseUnitPrice: 125_000,
    markupPercent: 0,
    discountPercent: 0,
    finalUnitPrice: 125_000,
    subtotal: 125_000
  }],
  notes: null,
  total: 125_000,
  paymentTermType: "IMMEDIATE",
  creditTermMonths: null,
  creditTermWeeks: null,
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
    mocks.sequence.mockResolvedValue({ lastValue: 1 });
    mocks.updateManySalesOrders.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(
      async (
        operation: (tx: {
          $queryRaw: typeof mocks.queryRaw;
          collectionTask: { create: typeof mocks.createCollectionTask };
          documentSequence: { upsert: typeof mocks.sequence };
          invoice: { create: typeof mocks.createInvoice };
          salesOrder: {
            findUnique: typeof mocks.findSalesOrder;
            findUniqueOrThrow: typeof mocks.findUpdatedSalesOrder;
            updateMany: typeof mocks.updateManySalesOrders;
          };
        }) => Promise<unknown>
      ) =>
        operation({
          $queryRaw: mocks.queryRaw,
          collectionTask: { create: mocks.createCollectionTask },
          documentSequence: { upsert: mocks.sequence },
          invoice: { create: mocks.createInvoice },
          salesOrder: {
            findUnique: mocks.findSalesOrder,
            findUniqueOrThrow: mocks.findUpdatedSalesOrder,
            updateMany: mocks.updateManySalesOrders
          }
        })
    );
  });

  it.each(["SALES", "ADMIN"] as const)("rejects direct approval from %s before reading the order", async role => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: `${role.toLowerCase()}-1`,
      role,
      status: "Active"
    });
    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("expectedVersion", "1");
    formData.set("decision", "Approved");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/sales-orders?tab=approval&error=Only%20a%20Manager%20can%20approve%20or%20reject%20sales%20orders"
    );
    expect(mocks.findSalesOrder).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("requires a non-whitespace reason before rejecting an order", async () => {
    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("expectedVersion", "1");
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

  it("rejects a 151-character reason before reading or mutating the order", async () => {
    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("expectedVersion", "1");
    formData.set("confirmationNote", "é".repeat(151));
    formData.set("returnPath", "/customer-purchase-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "Action%20notes%20must%20be%20150%20characters%20or%20fewer"
    );
    expect(mocks.findSalesOrder).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("stores a 150-character Unicode rejection reason intact in notes and audit", async () => {
    const rejectionReason = "é".repeat(150);
    const pendingWithHistory = {
      ...pendingCustomerPo,
      notes: "Original sales note"
    };
    mocks.findSalesOrder.mockResolvedValue(pendingWithHistory);
    mocks.findUpdatedSalesOrder.mockResolvedValue({
      ...pendingWithHistory,
      status: "Cancelled",
      approvalStatus: "Rejected",
      approvalDecisionNote: rejectionReason,
      version: 2
    });

    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("expectedVersion", "1");
    formData.set("confirmationNote", rejectionReason);
    formData.set("returnPath", "/customer-purchase-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "success=Customer%20PO%20rejected"
    );
    expect(mocks.updateManySalesOrders).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        approvalDecisionNote: rejectionReason,
        notes: `Original sales note\nConfirmation note: ${rejectionReason}`
      })
    }));
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REJECTED", actionNote: rejectionReason }),
      expect.objectContaining({ transaction: expect.anything() })
    );
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
    formData.set("expectedVersion", "1");
    formData.set("decisionNote", rejectionReason);
    formData.set("returnPath", "/sales-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&success=Customer%20PO%20rejected"
    );
    expect(mocks.updateManySalesOrders).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: pendingCustomerPo.id,
        version: 1,
        approvalStatus: "Pending"
      }),
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
      expect.objectContaining({ action: "REJECTED" }),
      expect.objectContaining({ transaction: expect.anything() })
    );
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("prevents a later decision from overwriting an already claimed approval", async () => {
    mocks.findSalesOrder.mockResolvedValue(pendingCustomerPo);
    mocks.updateManySalesOrders.mockResolvedValue({ count: 0 });

    const formData = new FormData();
    formData.set("salesOrderId", pendingCustomerPo.id);
    formData.set("decision", "Rejected");
    formData.set("expectedVersion", "1");
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
    formData.set("expectedVersion", "1");
    formData.set("returnPath", "/sales-orders");

    await expect(decideSalesOrderApproval(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/customer-purchase-orders?tab=approval&success=Customer%20PO%20approved%20and%20invoice%20generated"
    );
    expect(mocks.updateManySalesOrders).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: pendingCustomerPo.id,
        version: 1,
        approvalStatus: "Pending"
      }),
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
      expect.arrayContaining([
        expect.objectContaining({ moduleName: "Customer Purchase Orders", action: "APPROVED" }),
        expect.objectContaining({ moduleName: "Invoices", action: "CREATED" }),
        expect.objectContaining({ moduleName: "Receivables", action: "CREATED" })
      ]),
      expect.objectContaining({ transaction: expect.anything() })
    );
  });

  it.each(["Pending", "Rejected"] as const)(
    "blocks invoice generation for a %s Customer PO",
    async (approvalStatus) => {
      mocks.findSalesOrder.mockResolvedValue({
        ...pendingCustomerPo,
        approvalStatus
      });

      const formData = new FormData();
      formData.set("salesOrderId", pendingCustomerPo.id);

      await expect(generateInvoice(formData)).rejects.toThrow(
        "NEXT_REDIRECT:/customer-purchase-orders?error=Only%20a%20confirmed%2C%20approved%20order%20without%20an%20invoice%20can%20be%20invoiced"
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.updateManySalesOrders).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    }
  );
});
