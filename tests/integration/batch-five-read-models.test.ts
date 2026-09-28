import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildCustomerOrderBy,
  buildCustomerWhere,
  parseCustomerListFilters,
} from "../../src/lib/customer-query";
import { formatNpwp } from "../../src/lib/npwp";
import {
  buildReceivableOrderBy,
  buildReceivableWhere,
  parseReceivableFilters,
} from "../../src/lib/receivable-query";
import {
  buildDeliveryNoteOrderBy,
  buildDeliveryNoteWhere,
  parseDeliveryNoteListFilters,
} from "../../src/lib/delivery-note-query";
import {
  buildOutreachCustomerWhere,
  OUTREACH_LATEST_ORDER,
} from "../../src/lib/outreach-query";
import {
  encodeReferenceSnapshot,
  getDeliveryInvoiceReferences,
  getDeliveryOrderReferences,
} from "../../src/lib/delivery-note-references";

const prisma = new PrismaClient();
const ROLLBACK = "ROLLBACK_BATCH_FIVE_READ_MODELS";

describe("Batch 5 read-model consistency against the real database", () => {
  afterAll(() => prisma.$disconnect());

  it("reconciles three stable Customer pages and canonical/formatted NPWP search", async () => {
    const marker = `B5-CUSTOMER-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const npwp15 = `${Date.now()}11`.slice(0, 15);
    const npwp16 = `${Date.now()}222`.slice(0, 16);

    await expect(prisma.$transaction(async tx => {
      await tx.customer.createMany({
        data: Array.from({ length: 45 }, (_, index) => ({
          name: `Customer ${String(index).padStart(3, "0")}`,
          companyName: marker,
          npwp: index === 0 ? npwp15 : index === 1 ? npwp16 : null,
          phone: `0800-${String(index).padStart(3, "0")}`,
          email: `customer-${index}@batch-five.test`,
          address: "Batch 5",
          customerSegment: "SIT",
          status: "Inactive",
          notes: marker,
        })),
      });

      const filters = parseCustomerListFilters({
        query: marker,
        status: "Inactive",
        sort: "company",
        direction: "asc",
      });
      const where = buildCustomerWhere(filters);
      const orderBy = buildCustomerOrderBy(filters);
      const oracle = await tx.customer.findMany({ where, orderBy, select: { id: true, status: true } });
      const pagedIds: string[] = [];
      let cursor: string | undefined;

      do {
        const records = await tx.customer.findMany({
          where,
          orderBy,
          take: 21,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, status: true },
        });
        const page = records.slice(0, 20);
        expect(page.every(customer => customer.status === "Inactive")).toBe(true);
        pagedIds.push(...page.map(customer => customer.id));
        cursor = records.length > 20 ? page.at(-1)?.id : undefined;
      } while (cursor);

      expect(pagedIds).toEqual(oracle.map(customer => customer.id));
      expect(new Set(pagedIds).size).toBe(45);
      expect(await tx.customer.count({
        where: buildCustomerWhere(parseCustomerListFilters({ query: formatNpwp(npwp15) })),
      })).toBe(1);
      expect(await tx.customer.count({
        where: buildCustomerWhere(parseCustomerListFilters({ query: formatNpwp(npwp16) })),
      })).toBe(1);

      throw new Error(ROLLBACK);
    }, { timeout: 60_000 })).rejects.toThrow(ROLLBACK);
  }, 70_000);

  it("combines receivable, delivery, historical-link, and Unicode outreach predicates", async () => {
    const marker = `B5-DOMAIN-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await expect(prisma.$transaction(async tx => {
      const [customerA, customerB] = await Promise.all([
        tx.customer.create({ data: {
          name: "Tokyo Contact",
          companyName: `${marker}-A`,
          phone: "081-A",
          email: "a@batch-five.test",
          address: "Jakarta",
          customerSegment: "SIT",
        } }),
        tx.customer.create({ data: {
          name: "Other Contact",
          companyName: `${marker}-B`,
          phone: "081-B",
          email: "b@batch-five.test",
          address: "Bandung",
          customerSegment: "SIT",
        } }),
      ]);

      const amounts = [100, 2, 10];
      const orders = [];
      const invoices = [];
      for (let index = 0; index < amounts.length; index += 1) {
        const order = await tx.salesOrder.create({ data: {
          orderNumber: `${marker}-SO-${index}`,
          customerId: customerA.id,
          deliveryDestinationSnapshot: customerA.address,
          orderDate: new Date("2026-09-01T00:00:00Z"),
          status: "Invoiced",
          subtotal: amounts[index],
          total: amounts[index],
          netSalesAmount: amounts[index],
        } });
        const invoice = await tx.invoice.create({ data: {
          invoiceNumber: `${marker}-INV-${index}`,
          salesOrderId: order.id,
          customerId: customerA.id,
          issueDate: new Date("2026-09-01T00:00:00Z"),
          dueDate: new Date(`2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
          totalAmount: amounts[index],
          remainingAmount: amounts[index],
          netSalesAmount: amounts[index],
          orderNumberSnapshot: order.orderNumber,
          customerNameSnapshot: customerA.name,
          customerCompanySnapshot: customerA.companyName,
        } });
        orders.push(order);
        invoices.push(invoice);
      }

      const receivableFilters = parseReceivableFilters({
        tab: "ongoing",
        query: marker,
        sort: "amount",
        direction: "asc",
      });
      const receivables = await tx.invoice.findMany({
        where: buildReceivableWhere(receivableFilters, new Date("2026-09-28T00:00:00Z")),
        orderBy: buildReceivableOrderBy(receivableFilters),
      });
      expect(receivables.map(invoice => invoice.remainingAmount)).toEqual([2, 10, 100]);

      const orderSnapshot = encodeReferenceSnapshot([orders[0].orderNumber]);
      const invoiceSnapshot = encodeReferenceSnapshot([invoices[0].invoiceNumber]);
      const note = await tx.deliveryNote.create({ data: {
        deliveryNoteNumber: `${marker}-SJ-MATCH`,
        invoiceId: invoices[0].id,
        salesOrderId: orders[0].id,
        customerId: customerA.id,
        recipientName: customerA.name,
        recipientPhone: customerA.phone,
        recipientAddress: customerA.address,
        deliveryDate: new Date("2026-09-10T00:00:00Z"),
        status: "Issued",
        orderReferencesSnapshot: orderSnapshot,
        invoiceReferencesSnapshot: invoiceSnapshot,
      } });
      await tx.deliveryNote.create({ data: {
        deliveryNoteNumber: `${marker}-SJ-OTHER`,
        customerId: customerB.id,
        recipientName: customerB.name,
        recipientPhone: customerB.phone,
        recipientAddress: customerB.address,
        deliveryDate: new Date("2026-09-20T00:00:00Z"),
        status: "Draft",
      } });

      const deliveryFilters = parseDeliveryNoteListFilters({
        query: invoices[0].invoiceNumber,
        customerId: customerA.id,
        status: "Issued",
        startDate: "2026-09-01",
        endDate: "2026-09-15",
        sort: "date",
        direction: "asc",
      });
      const deliveryMatches = await tx.deliveryNote.findMany({
        where: buildDeliveryNoteWhere(deliveryFilters, ["Draft", "Issued"]),
        orderBy: buildDeliveryNoteOrderBy(deliveryFilters),
      });
      expect(deliveryMatches.map(item => item.id)).toEqual([note.id]);

      const historical = await tx.deliveryNote.update({
        where: { id: note.id },
        data: { invoiceId: null, salesOrderId: null },
        include: { invoice: true, salesOrder: true },
      });
      expect(getDeliveryOrderReferences(historical)).toEqual([
        { label: orders[0].orderNumber, href: null },
      ]);
      expect(getDeliveryInvoiceReferences(historical)).toEqual([
        { label: invoices[0].invoiceNumber, href: null },
      ]);

      const tiedAt = new Date("2026-09-28T08:00:00Z");
      await tx.customerOutreach.createMany({ data: [
        { id: `${marker}-outreach-a`, customerId: customerA.id, contactDate: tiedAt, createdAt: tiedAt, notes: "Produk 東京" },
        { id: `${marker}-outreach-z`, customerId: customerA.id, contactDate: tiedAt, createdAt: tiedAt, notes: "Produk 東京 terbaru" },
        { id: `${marker}-other`, customerId: customerB.id, contactDate: tiedAt, createdAt: tiedAt, notes: "Produk 東京" },
      ] });
      const outreachCustomers = await tx.customer.findMany({
        where: buildOutreachCustomerWhere("東京", { id: customerA.id }),
        include: { outreachActivities: { orderBy: OUTREACH_LATEST_ORDER, take: 1 } },
      });
      expect(outreachCustomers).toHaveLength(1);
      expect(outreachCustomers[0].id).toBe(customerA.id);
      expect(outreachCustomers[0].outreachActivities[0].id).toBe(`${marker}-outreach-z`);

      throw new Error(ROLLBACK);
    }, { timeout: 60_000 })).rejects.toThrow(ROLLBACK);
  }, 70_000);
});
