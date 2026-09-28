import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const command = process.argv[2];
const runId = process.argv[3];
const CUSTOMER_COUNT = 240;
const ORDERS_PER_CUSTOMER = 12;

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

async function main() {
  assertPerformanceDatabase();
  if (!/^[a-z0-9-]{3,32}$/.test(runId ?? "")) {
    throw new Error("Pass a lowercase run id (3-32 chars), for example: batch4-001");
  }
  if (command === "seed") return seed();
  if (command === "cleanup") return cleanup();
  if (command === "reconcile") return reconcile();
  throw new Error("Usage: node scripts/batch4-volume.mjs <seed|cleanup|reconcile> <run-id>");
}

function assertPerformanceDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    process.env.BATCH4_PERFORMANCE_DATABASE !== "YES_BATCH4_PERFORMANCE_ONLY" ||
    process.env.BATCH4_EXPECTED_DATABASE_HOST !== url.hostname ||
    process.env.BATCH4_EXPECTED_DATABASE_NAME !== databaseName
  ) {
    throw new Error(
      "Refusing to mutate this database. Set the explicit Batch 4 opt-in plus the exact expected host and database name for an isolated performance database.",
    );
  }
}

function marker() {
  return `BATCH4_PERF_RUN:${runId}`;
}

async function seed() {
  if (await prisma.customer.count({ where: { notes: marker() } })) {
    throw new Error(`Run ${runId} already exists; clean it before reseeding.`);
  }

  const users = Array.from({ length: 3 }, (_, index) => ({
    id: `b4-${runId}-u-${index}`,
    username: `b4-${runId}-sales-${index}`,
    passwordHash: "PERFORMANCE_FIXTURE_NOT_FOR_LOGIN",
    displayName: `Batch 4 Sales ${index}`,
    role: "SALES",
  }));
  const customers = Array.from({ length: CUSTOMER_COUNT }, (_, index) => ({
    id: `b4-${runId}-c-${index}`,
    name: `Contact ${index}`,
    companyName: `[${runId}] Company ${String(index).padStart(3, "0")}`,
    phone: "",
    email: "",
    address: "Performance fixture",
    customerSegment: index % 2 ? "Retail" : "Project",
    portfolioOwnerUserId: users[index % users.length].id,
    notes: marker(),
  }));
  const orders = [];
  const orderItems = [];
  const invoices = [];
  const pickingLists = [];
  const pickingItems = [];
  const collectionTasks = [];
  const payments = [];
  const deliveryNotes = [];

  for (let customerIndex = 0; customerIndex < customers.length; customerIndex += 1) {
    for (let orderIndex = 0; orderIndex < ORDERS_PER_CUSTOMER; orderIndex += 1) {
      const sequence = customerIndex * ORDERS_PER_CUSTOMER + orderIndex;
      const id = `b4-${runId}-so-${sequence}`;
      const isDraft = orderIndex % 4 === 0;
      const total = 100_000 + (sequence % 50) * 10_000;
      const orderDate = new Date(Date.UTC(2026, sequence % 9, (sequence % 27) + 1, 17));
      const requiredDate = new Date(Date.UTC(2026, 8, 27 + (sequence % 10), 17));
      orders.push({
        id,
        orderNumber: `B4-${runId}-SO-${String(sequence).padStart(5, "0")}`,
        customerPoNumber: sequence % 2 ? `B4-${runId}-PO-${sequence}` : null,
        source: sequence % 2 ? "CUSTOMER_PO" : "DIRECT",
        requiredDate,
        customerId: customers[customerIndex].id,
        orderDate,
        status: isDraft ? "Draft" : "Invoiced",
        subtotal: total,
        total,
        netSalesAmount: total,
        approvalStatus: "NotRequired",
        createdByUserId: customers[customerIndex].portfolioOwnerUserId,
        notes: marker(),
      });
      for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
        orderItems.push({
          id: `b4-${runId}-soi-${sequence}-${itemIndex}`,
          salesOrderId: id,
          itemName: `Volume item ${itemIndex}`,
          quantity: 5,
          baseUnitPrice: total / 10,
          finalUnitPrice: total / 10,
          subtotal: total / 2,
        });
      }
      if (isDraft) continue;

      const invoiceId = `b4-${runId}-inv-${sequence}`;
      const pickingId = `b4-${runId}-pick-${sequence}`;
      const paidAmount = sequence % 3 === 0 ? total : sequence % 3 === 1 ? total / 2 : 0;
      invoices.push({
        id: invoiceId,
        invoiceNumber: `B4-${runId}-INV-${String(sequence).padStart(5, "0")}`,
        salesOrderId: id,
        customerId: customers[customerIndex].id,
        issueDate: orderDate,
        dueDate: new Date(orderDate.getTime() + 28 * 86_400_000),
        totalAmount: total,
        paidAmount,
        remainingAmount: total - paidAmount,
        netSalesAmount: total,
        status: paidAmount === total ? "Paid" : paidAmount ? "Partial" : "Unpaid",
        notes: marker(),
      });
      if (paidAmount) {
        payments.push({
          id: `b4-${runId}-pay-${sequence}`,
          invoiceId,
          paymentDate: new Date(orderDate.getTime() + 7 * 86_400_000),
          amount: paidAmount,
          paymentMethod: "BankTransfer",
          notes: marker(),
        });
      }
      if (paidAmount < total) {
        collectionTasks.push({
          id: `b4-${runId}-col-${sequence}`,
          customerId: customers[customerIndex].id,
          invoiceId,
          scheduledDate: new Date(orderDate.getTime() + 28 * 86_400_000),
          status: "Planned",
          notes: marker(),
        });
      }
      pickingLists.push({
        id: pickingId,
        pickingListNumber: `B4-${runId}-PL-${String(sequence).padStart(5, "0")}`,
        salesOrderId: id,
        status: "Packed",
        pickerName: sequence % 2 ? "Dewi" : "Raka",
        packerName: sequence % 3 ? "Bima" : "Sari",
        packageCount: 1,
        notes: marker(),
        packedAt: new Date(Date.UTC(2026, 8, sequence % 2 ? 26 : 27, 10)),
      });
      for (let itemIndex = 0; itemIndex < 2; itemIndex += 1) {
        const shortage = sequence % 5 === 0 && itemIndex === 1;
        pickingItems.push({
          id: `b4-${runId}-pi-${sequence}-${itemIndex}`,
          pickingListId: pickingId,
          salesOrderItemId: `b4-${runId}-soi-${sequence}-${itemIndex}`,
          itemName: `Volume item ${itemIndex}`,
          orderedQuantity: 5,
          availableQuantity: shortage ? 3 : 5,
          packedQuantity: shortage ? 3 : 5,
          availabilityStatus: shortage ? "Partial" : "Available",
        });
      }
      if (sequence % 3 !== 2) {
        deliveryNotes.push({
          id: `b4-${runId}-dn-${sequence}`,
          deliveryNoteNumber: `B4-${runId}-DN-${String(sequence).padStart(5, "0")}`,
          invoiceId,
          salesOrderId: id,
          pickingListId: pickingId,
          customerId: customers[customerIndex].id,
          recipientName: "Performance recipient",
          recipientPhone: "",
          recipientAddress: "Performance fixture",
          deliveryDate: requiredDate,
          status: sequence % 3 === 0 ? "Delivered" : "Issued",
          notes: marker(),
        });
      }
    }
  }

  await createInBatches(prisma.user, users);
  await createInBatches(prisma.customer, customers);
  await createInBatches(prisma.salesOrder, orders);
  await createInBatches(prisma.salesOrderItem, orderItems);
  await createInBatches(prisma.invoice, invoices);
  await createInBatches(prisma.payment, payments);
  await createInBatches(prisma.collectionTask, collectionTasks);
  await createInBatches(prisma.pickingList, pickingLists);
  await createInBatches(prisma.pickingListItem, pickingItems);
  await createInBatches(prisma.deliveryNote, deliveryNotes);
  await reconcile();
}

async function cleanup() {
  const customerIds = (
    await prisma.customer.findMany({ where: { notes: marker() }, select: { id: true } })
  ).map(({ id }) => id);
  if (!customerIds.length) return console.log(`No rows found for ${marker()}.`);
  const orderIds = (
    await prisma.salesOrder.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
  ).map(({ id }) => id);
  const invoiceIds = (
    await prisma.invoice.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } })
  ).map(({ id }) => id);
  await prisma.deliveryNote.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.collectionTask.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
  await prisma.pickingList.deleteMany({ where: { salesOrderId: { in: orderIds } } });
  await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: `b4-${runId}-sales-` } } });
  console.log(`Cleaned ${marker()} only.`);
}

async function reconcile() {
  const [customers, orders, invoices, invoiceTotals, payments, paymentTotals] = await Promise.all([
    prisma.customer.count({ where: { notes: marker() } }),
    prisma.salesOrder.count({ where: { notes: marker() } }),
    prisma.invoice.count({ where: { notes: marker() } }),
    prisma.invoice.aggregate({ where: { notes: marker() }, _sum: { totalAmount: true, paidAmount: true, remainingAmount: true } }),
    prisma.payment.count({ where: { notes: marker() } }),
    prisma.payment.aggregate({ where: { notes: marker() }, _sum: { amount: true } }),
  ]);
  const output = {
    runId,
    customers,
    orders,
    invoices,
    payments,
    totalAmount: invoiceTotals._sum.totalAmount ?? 0,
    paidAmount: invoiceTotals._sum.paidAmount ?? 0,
    remainingAmount: invoiceTotals._sum.remainingAmount ?? 0,
    paymentAmount: paymentTotals._sum.amount ?? 0,
  };
  output.invoiceReconciles = output.totalAmount === output.paidAmount + output.remainingAmount;
  output.paymentReconciles = output.paidAmount === output.paymentAmount;
  console.log(JSON.stringify(output, null, 2));
  if (!output.invoiceReconciles || !output.paymentReconciles) process.exitCode = 2;
}

async function createInBatches(model, data, size = 500) {
  for (let offset = 0; offset < data.length; offset += size) {
    await model.createMany({ data: data.slice(offset, offset + size) });
  }
}
