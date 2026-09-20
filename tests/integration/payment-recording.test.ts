import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  PaymentRecordingError,
  recordInvoicePayment
} from "../../src/lib/payment-recording";

const prisma = new PrismaClient();

describe("concurrency-safe payment recording", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("serializes simultaneous payments and closes the invoice when their total is fully paid", async () => {
    const fixture = await createInvoiceFixture(1_000);

    try {
      await Promise.all([
        runPayment({
          invoiceId: fixture.invoiceId,
          amount: 600,
          paymentMethod: "BankTransfer",
          notes: "Concurrent payment A"
        }),
        runPayment({
          invoiceId: fixture.invoiceId,
          amount: 400,
          paymentMethod: "Cash",
          notes: "Concurrent payment B"
        })
      ]);

      const [invoice, payments] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({
          where: { id: fixture.invoiceId }
        }),
        prisma.payment.aggregate({
          where: { invoiceId: fixture.invoiceId },
          _sum: { amount: true },
          _count: { _all: true }
        })
      ]);

      expect(invoice).toMatchObject({
        totalAmount: 1_000,
        paidAmount: 1_000,
        remainingAmount: 0,
        status: "Paid"
      });
      expect(payments._sum.amount).toBe(1_000);
      expect(payments._count._all).toBe(2);
    } finally {
      await removeInvoiceFixture(fixture);
    }
  }, 30_000);

  it("rejects a stale overpayment after another transaction changes the balance", async () => {
    const fixture = await createInvoiceFixture(1_000);

    try {
      const results = await Promise.allSettled([
        runPayment({
          invoiceId: fixture.invoiceId,
          amount: 600,
          paymentMethod: "BankTransfer",
          notes: null
        }),
        runPayment({
          invoiceId: fixture.invoiceId,
          amount: 600,
          paymentMethod: "BankTransfer",
          notes: null
        })
      ]);
      const fulfilled = results.filter(
        (result) => result.status === "fulfilled"
      );
      const rejected = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(PaymentRecordingError);
      expect(rejected[0]?.reason).toMatchObject({
        code: "INVALID_PAYMENT_AMOUNT"
      });

      const [invoice, payments] = await Promise.all([
        prisma.invoice.findUniqueOrThrow({
          where: { id: fixture.invoiceId }
        }),
        prisma.payment.aggregate({
          where: { invoiceId: fixture.invoiceId },
          _sum: { amount: true },
          _count: { _all: true }
        })
      ]);

      expect(invoice).toMatchObject({
        paidAmount: 600,
        remainingAmount: 400,
        status: "Partial"
      });
      expect(payments._sum.amount).toBe(600);
      expect(payments._count._all).toBe(1);
    } finally {
      await removeInvoiceFixture(fixture);
    }
  }, 30_000);
});

async function createInvoiceFixture(totalAmount: number) {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const customer = await prisma.customer.create({
    data: {
      name: `Payment Lock ${marker}`,
      companyName: `Payment Lock ${marker}`,
      phone: "",
      email: "",
      address: "",
      customerSegment: "Test",
      status: "Inactive"
    }
  });
  const salesOrder = await prisma.salesOrder.create({
    data: {
      orderNumber: `SO-PAY-LOCK-${marker}`,
      customerId: customer.id,
      orderDate: new Date(),
      status: "Invoiced",
      subtotal: totalAmount,
      total: totalAmount
    }
  });
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `INV-PAY-LOCK-${marker}`,
      salesOrderId: salesOrder.id,
      customerId: customer.id,
      issueDate: new Date(),
      dueDate: new Date("2099-12-31T00:00:00.000Z"),
      totalAmount,
      paidAmount: 0,
      remainingAmount: totalAmount,
      status: "Unpaid"
    }
  });

  return {
    customerId: customer.id,
    salesOrderId: salesOrder.id,
    invoiceId: invoice.id
  };
}

function runPayment({
  invoiceId,
  amount,
  paymentMethod,
  notes
}: {
  invoiceId: string;
  amount: number;
  paymentMethod: "BankTransfer" | "Cash";
  notes: string | null;
}) {
  return prisma.$transaction(
    (tx) =>
      recordInvoicePayment(tx, {
        invoiceId,
        paymentDate: new Date(),
        amount,
        paymentMethod,
        notes
      }),
    {
      maxWait: 20_000,
      timeout: 20_000
    }
  );
}

async function removeInvoiceFixture(fixture: {
  customerId: string;
  salesOrderId: string;
  invoiceId: string;
}) {
  await prisma.$transaction([
    prisma.invoice.deleteMany({
      where: { id: fixture.invoiceId }
    }),
    prisma.salesOrder.deleteMany({
      where: { id: fixture.salesOrderId }
    }),
    prisma.customer.deleteMany({
      where: { id: fixture.customerId }
    })
  ]);
}
