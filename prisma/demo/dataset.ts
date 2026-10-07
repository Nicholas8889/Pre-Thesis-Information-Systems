import { calculateAdjustedUnitPrice, calculateDueDateForPaymentTerm } from "../../src/lib/calculations";
import { buildOrderTaxSnapshot } from "../../src/lib/tax";
import { ACTIVE_DELIVERY_ASSIGNMENTS } from "../../src/lib/delivery-options";

export type DemoRow = Record<string, unknown>;
export type DemoAccounts = Record<"admin" | "sales" | "manager", { id: string; username: string; displayName: string; role: string }>;
export const DEMO_VERSION = "umkm-textile-v1";
// Parents precede children. Keep reset separate from migrations and from insertion.
export const DEMO_TABLE_ORDER = [
  "users", "customers", "products", "product_cost_history", "sales_orders",
  "sales_order_items", "invoices", "payments", "picking_lists", "picking_list_items",
  "delivery_notes", "delivery_note_sources", "delivery_note_items", "customer_inquiries",
  "customer_inquiry_items", "customer_outreach", "collection_tasks", "audit_trails",
  "document_sequences", "dashboard_analysis_runs", "dashboard_analysis_snapshots"
] as const;

export type DemoDataset = {
  version: string;
  anchorDate: string;
  tables: Record<string, DemoRow[]>;
  documents: Array<{ storedName: string; fileName: string; orderId: string; customer: string; number: string;
    date: string; requiredDate: string; items: DemoRow[]; total: number; tax: number }>;
};

const CATALOG = [
  ["TJK-TKR-1218", "Tikar Lipat 120 x 180 cm", 60000],
  ["TJK-TKR-1520", "Tikar Lipat 150 x 200 cm", 85000],
  ["TJK-KRP-1620", "Karpet Tenun 160 x 200 cm", 140000],
  ["TJK-MTR-0920", "Matras Lipat 90 x 200 cm", 220000],
  ["TJK-KSR-0920", "Kasur Busa 90 x 200 cm", 280000],
  ["TJK-KSR-1220", "Kasur Busa 120 x 200 cm", 375000],
  ["TJK-KSR-1620", "Kasur Busa 160 x 200 cm", 520000],
  ["TJK-ALS-1218", "Alas Tidur Quilting 120 x 180 cm", 110000],
  ["TJK-SJD-0711", "Sajadah Tekstil 70 x 110 cm", 45000],
  ["TJK-BNT-6060", "Bantalan Lantai 60 x 60 cm", 70000]
] as const;

const CUSTOMERS = [
  ["Toko Tekstil Sumber Rejeki", "Budi Hartono", "Bandung", "Wholesale"],
  ["Toko Kasur Mandiri", "Siti Aminah", "Bekasi", "Wholesale"],
  ["CV Mitra Alas Nusantara", "Agus Setiawan", "Bogor", "Wholesale"],
  ["Toko Perlengkapan Rumah Melati", "Rina Lestari", "Depok", "Retail"],
  ["CV Berkah Textile", "Dedi Kurniawan", "Cirebon", "Wholesale"],
  ["Toko Karpet Harmoni", "Lina Marlina", "Garut", "Retail"],
  ["Toko Kasur Sejahtera", "Arif Hidayat", "Tasikmalaya", "Retail"],
  ["Penginapan Puri Asri", "Dewi Anggraini", "Bandung", "Corporate"],
  ["Toko Rumah Nyaman", "Hendra Wijaya", "Karawang", "Retail"],
  ["CV Sentosa Bedding", "Maya Permata", "Sukabumi", "Wholesale"],
  ["Toko Tikar Makmur", "Rizky Pratama", "Subang", "Retail"],
  ["Homestay Cempaka", "Nina Wulandari", "Lembang", "Corporate"],
  ["Toko Karpet Pelangi", "Fajar Nugroho", "Purwakarta", "Retail"],
  ["CV Karya Interior", "Ratna Puspita", "Sumedang", "Corporate"],
  ["Toko Tekstil Cahaya Baru", "Andi Saputra", "Cimahi", "Retail"]
] as const;

function id(kind: string, index: number) { return `demo-v1-${kind}-${String(index + 1).padStart(3, "0")}`; }
function iso(date: Date) { return date.toISOString(); }
function days(date: Date, amount: number) { return new Date(date.getTime() + amount * 86400000); }
function dated(row: DemoRow, date: Date): DemoRow { return { ...row, created_at: iso(date), updated_at: iso(date) }; }
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`Demo dataset: ${message}`); }

export function jakartaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildDemoDataset(accounts: DemoAccounts, anchorDate = jakartaToday(), ppnRateBasisPoints = 1100): DemoDataset {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(anchorDate), "anchor must be YYYY-MM-DD");
  const anchor = new Date(`${anchorDate}T12:00:00+07:00`);
  requireValue(Number.isFinite(anchor.getTime()) && iso(anchor).slice(0, 10) === anchorDate, "invalid anchor date");
  const tables: Record<string, DemoRow[]> = Object.fromEntries(DEMO_TABLE_ORDER.map(table => [table, []]));
  const result: DemoDataset = { version: DEMO_VERSION, anchorDate, tables, documents: [] };
  const numberCounters = new Map<string, number>();
  function documentNumber(type: string, date: Date) {
    const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric" }).format(date));
    const key = `${type}:${year}`; const next = (numberCounters.get(key) ?? 0) + 1; numberCounters.set(key, next);
    return `${type}-${year}-${String(next).padStart(3, "0")}`;
  }
  function priorMonth(monthsAgo: number, day: number) {
    const date = new Date(anchor); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - monthsAgo); date.setUTCDate(day); return date;
  }
  const demoStart = priorMonth(5, 1);
  tables.customers = CUSTOMERS.map(([company, person, city, segment], index) => dated({
    id: id("customer", index), name: person, company_name: company,
    npwp: index % 3 === 0 ? `990000000000${String(index + 1).padStart(4, "0")}` : null,
    phone: `08000000${String(index + 1).padStart(4, "0")}`, email: `pelanggan${index + 1}@example.test`,
    address: `Jl. Contoh Niaga No. ${index + 1}, ${city} (alamat simulasi)`, customer_segment: segment,
    status: "Active", portfolio_owner_user_id: accounts.sales.id,
    notes: index === 14 ? "Calon pelanggan; inquiry pertama, belum ada transaksi." : "Data simulasi UMKM tekstil untuk demonstrasi akademik."
  }, demoStart));
  tables.products = CATALOG.map(([sku, name, cost], index) => dated({
    id: id("product", index), sku, product_name: name, list_price: cost, status: "Active",
    notes: "Katalog simulasi CV Tajuk; biaya dasar per unit contoh, bukan daftar harga aktual perusahaan."
  }, demoStart));
  tables.product_cost_history = tables.products.flatMap((product, index) => [
    { id: id("cost", index * 2), product_id: product.id, unit_cost: Math.round(Number(product.list_price) * 0.95),
      effective_from: iso(days(anchor, -40)), created_by_user_id: accounts.admin.id, created_at: iso(days(anchor, -40)) },
    { id: id("cost", index * 2 + 1), product_id: product.id, unit_cost: product.list_price,
      effective_from: iso(days(anchor, -10)), created_by_user_id: accounts.admin.id, created_at: iso(days(anchor, -10)) }
  ]);
  const customerIndexes = [0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 6, 7, 12, 8, 9, 10, 8, 9, 2, 12, 13, 3];
  const poIndexes = new Set([3, 7, 11, 15, 19, 23, 25, 28]);
  const orderDates = [
    ...[3, 8, 13, 18, 23].map(day => priorMonth(5, day)),
    ...[3, 8, 13, 18, 23].map(day => priorMonth(4, day)),
    priorMonth(3, 12), priorMonth(1, 10), days(anchor, -2), days(anchor, -1),
    ...[-28, -21, -14, -7, -3, -2, -1, -45, -40, -35, -1, -1, -2, -1, -1, -3].map(offset => days(anchor, offset))
  ];
  // Guarantee all six calendar months are represented even on the first/last
  // day of a month; relative offsets alone can leave one month empty.
  orderDates[9] = priorMonth(2, 12);
  orderDates[27] = anchor;
  for (let index = 0; index < 30; index++) {
    const customer = tables.customers[customerIndexes[index]]; const orderDate = orderDates[index];
    const source = poIndexes.has(index) ? "CUSTOMER_PO" : "DIRECT";
    const orderNumber = documentNumber("SO", orderDate);
    const customerPoNumber = source === "CUSTOMER_PO" ? documentNumber("PO", orderDate) : null;
    const pending = index === 24 || index === 25; const cancelled = index === 29;
    const immediate = [0, 2, 7, 8, 9, 12, 26, 29].includes(index);
    const weeks = !immediate && [1, 3, 4, 5, 6, 18, 19, 20, 24, 25, 27, 28].includes(index) ? (index < 18 ? 4 : 2) : null;
    const months = !immediate && weeks === null ? (index === 10 ? 3 : 1) : null;
    const term = { paymentTermType: immediate ? "IMMEDIATE" as const : "CREDIT" as const, creditTermWeeks: weeks, creditTermMonths: months };
    const lines = [index % 10, (index + 3) % 10].map((productIndex, lineIndex) => {
      const product = tables.products[productIndex]; const quantity = lineIndex === 0 ? 10 + index % 5 * 5 : 5 + index % 3 * 5;
      const markup = 30; const discount = index % 4 === 0 ? 5 : 0;
      const finalPrice = calculateAdjustedUnitPrice(Number(product.list_price), markup, discount);
      return { id: id("order-item", index * 2 + lineIndex), sales_order_id: id("order", index), product_id: product.id,
        item_name: product.product_name, product_sku_snapshot: product.sku, quantity, base_unit_price: product.list_price,
        markup_percent: markup, discount_percent: discount, final_unit_price: finalPrice, subtotal: quantity * finalPrice };
    });
    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const tax = buildOrderTaxSnapshot({ totalAmount: total, customerNpwp: customer.npwp as string | null, ppnRateBasisPoints });
    const taxColumns = { customer_npwp_snapshot: tax.customerNpwpSnapshot, ppn_applied: tax.ppnApplied,
      ppn_rate_basis_points: tax.ppnRateBasisPoints, ppn_amount: tax.ppnAmount, net_sales_amount: tax.netSalesAmount };
    const storedName = customerPoNumber ? `demo/${DEMO_VERSION}/${anchorDate}/${customerPoNumber}.pdf` : null;
    const order = dated({ id: id("order", index), order_number: orderNumber, customer_po_number: customerPoNumber, source,
      required_date: source === "CUSTOMER_PO" ? iso(days(orderDate, 7)) : null,
      customer_po_document_name: customerPoNumber ? `${customerPoNumber}.pdf` : null,
      customer_po_document_stored_name: storedName, customer_po_document_mime_type: customerPoNumber ? "application/pdf" : null,
      customer_po_document_size: null, customer_po_document_sha256: null, idempotency_key: `${DEMO_VERSION}:${anchorDate}:${index}`,
      version: 1, customer_id: customer.id, delivery_destination_snapshot: customer.address, order_date: iso(orderDate),
      status: cancelled ? "Cancelled" : pending ? "Draft" : index < 24 ? "Invoiced" : "Confirmed", subtotal: total, total, ...taxColumns,
      payment_term_type: term.paymentTermType, credit_term_months: months, credit_term_weeks: weeks,
      notes: cancelled ? "Pelanggan membatalkan permintaan sebelum invoice karena perubahan kebutuhan." :
        pending ? "Menunggu persetujuan Manager: masih ada tagihan barang yang telah diterima." :
        index >= 26 ? "Order baru siap diproses menjadi invoice." : "Pesanan pengadaan produk tekstil untuk kebutuhan pelanggan.",
      approval_status: pending ? "Pending" : "NotRequired", approval_risk: pending ? "Outstanding Payment" : null,
      approval_decision_note: null, approval_decided_at: null, approval_decided_by_id: null, created_by_user_id: accounts.sales.id
    }, orderDate);
    tables.sales_orders.push(order); tables.sales_order_items.push(...lines);
    if (customerPoNumber) result.documents.push({ storedName: storedName!, fileName: `${customerPoNumber}.pdf`, orderId: String(order.id),
      customer: String(customer.company_name), number: customerPoNumber, date: iso(orderDate).slice(0, 10),
      requiredDate: String(order.required_date).slice(0, 10), items: lines, total, tax: tax.ppnAmount });
    if (index >= 24) continue;
    const dueDate = calculateDueDateForPaymentTerm({ issueDate: orderDate, ...term });
    const paidAmount = index < 14 ? total : index < 18 ? Math.floor(total / 2) : 0;
    const status = index < 14 ? "Paid" : index < 18 ? "Partial" : index < 21 ? "Unpaid" : "Overdue";
    const invoice = dated({ id: id("invoice", index), invoice_number: documentNumber("INV", orderDate), sales_order_id: order.id,
      customer_id: customer.id, issue_date: iso(orderDate), due_date: iso(dueDate), total_amount: total,
      paid_amount: paidAmount, remaining_amount: total - paidAmount, ...taxColumns,
      order_number_snapshot: orderNumber, order_source_snapshot: source, customer_po_number_snapshot: customerPoNumber,
      customer_name_snapshot: customer.name, customer_company_snapshot: customer.company_name, customer_phone_snapshot: customer.phone,
      customer_email_snapshot: customer.email, customer_address_snapshot: customer.address,
      items_snapshot: lines.map(line => ({ itemName: line.item_name, productSku: line.product_sku_snapshot, quantity: line.quantity,
        baseUnitPrice: line.base_unit_price, markupPercent: line.markup_percent, discountPercent: line.discount_percent,
        finalUnitPrice: line.final_unit_price, subtotal: line.subtotal })), payment_term_type: term.paymentTermType,
      credit_term_months: months, credit_term_weeks: weeks, status, version: 1, cancellation_reason: null,
      cancelled_at: null, cancelled_by_user_id: null, notes: "Invoice simulasi; data dan nilai bukan transaksi perusahaan sebenarnya."
    }, orderDate);
    tables.invoices.push(invoice);
    if (paidAmount > 0) {
      // One regular payer has >=3 on-time samples; another has >=3 late samples.
      const proposedPaymentDate = index >= 3 && index <= 5 ? days(dueDate, 5) : immediate ? orderDate : days(orderDate, index < 14 ? 5 : 2);
      const paymentDate = new Date(Math.min(proposedPaymentDate.getTime(), anchor.getTime()));
      invoice.updated_at = iso(paymentDate);
      const paymentParts = index < 4 ? [Math.floor(paidAmount / 2), paidAmount - Math.floor(paidAmount / 2)] : [paidAmount];
      paymentParts.forEach((amount, part) => tables.payments.push({ id: `demo-v1-payment-${index + 1}-${part + 1}`, invoice_id: invoice.id,
        payment_date: iso(part === 0 && paymentParts.length === 2 ? orderDate : paymentDate), amount, payment_method: immediate ? "Cash" : "BankTransfer",
        notes: paymentParts.length === 2 ? `${part === 0 ? "Uang muka" : "Pelunasan"} pengadaan produk tekstil.` :
          status === "Partial" ? "Pembayaran tahap pertama; sisa mengikuti jatuh tempo." : "Pelunasan invoice pelanggan.",
        created_at: iso(part === 0 && paymentParts.length === 2 ? orderDate : paymentDate),
        updated_at: iso(part === 0 && paymentParts.length === 2 ? orderDate : paymentDate) }));
    }
  }

  const delivered = [...Array.from({ length: 11 }, (_, i) => i), 14, 15, 21, 22, 23];
  const pickingIndexes = [...delivered, 16, 18, 17, 19];
  for (const index of pickingIndexes) {
    const order = tables.sales_orders[index]; const date = new Date(String(order.order_date)); const inProgress = index === 19;
    tables.picking_lists.push(dated({ id: id("picking", index), picking_list_number: `PL-${order.order_number}`, sales_order_id: order.id,
      status: inProgress ? "InProgress" : "Packed", picker_name: "Dian", packer_name: inProgress ? null : "Rudi",
      package_count: inProgress ? null : 2, packed_at: inProgress ? null : iso(days(date, 1)),
      notes: inProgress ? "Sebagian barang sedang disiapkan gudang." : "Jumlah telah diperiksa dan siap dikirim."
    }, date));
    const lines = tables.sales_order_items.filter(line => line.sales_order_id === order.id);
    lines.forEach((line, lineIndex) => tables.picking_list_items.push({ id: id("picking-item", index * 2 + lineIndex),
      picking_list_id: id("picking", index), sales_order_item_id: line.id, item_name: line.item_name,
      ordered_quantity: line.quantity, available_quantity: inProgress ? Math.floor(Number(line.quantity) / 2) : line.quantity,
      packed_quantity: inProgress ? 0 : line.quantity, availability_status: inProgress ? "Partial" : "Available", notes: null }));
  }
  const deliveryGroups = [[0, 1], ...delivered.filter(i => i !== 0 && i !== 1).map(i => [i]), [16], [18]];
  deliveryGroups.forEach((indexes, groupIndex) => {
    const orders = indexes.map(index => tables.sales_orders[index]); const customer = tables.customers.find(c => c.id === orders[0].customer_id)!;
    const latestDate = new Date(Math.max(...orders.map(order => new Date(String(order.order_date)).getTime())));
    const state = indexes[0] === 16 ? "Issued" : indexes[0] === 18 ? "Draft" : "Delivered";
    const assignment = ACTIVE_DELIVERY_ASSIGNMENTS[groupIndex % ACTIVE_DELIVERY_ASSIGNMENTS.length];
    const deliveryDate = days(latestDate, state === "Draft" ? 3 : 2);
    const delivery = dated({ id: id("delivery", groupIndex), delivery_note_number: documentNumber("SJ", latestDate),
      invoice_id: indexes.length === 1 ? id("invoice", indexes[0]) : null,
      sales_order_id: indexes.length === 1 ? orders[0].id : null, picking_list_id: indexes.length === 1 ? id("picking", indexes[0]) : null,
      customer_id: customer.id, recipient_name: customer.name, recipient_phone: customer.phone, recipient_address: customer.address,
      delivery_date: iso(deliveryDate).slice(0, 10), status: state,
      notes: indexes.length > 1 ? "Dua order pelanggan yang sama dikirim dalam satu perjalanan." : "Pengiriman produk tekstil sesuai pesanan.",
      receiver_name: state === "Delivered" ? customer.name : null, sender_name: accounts.admin.displayName,
      driver_name: assignment.driverName, vehicle_plate_number: assignment.vehiclePlateNumber, authorized_by: accounts.manager.displayName,
      created_by: accounts.admin.displayName, issued_at: state === "Draft" ? null : iso(days(latestDate, 1)),
      issued_by: state === "Draft" ? null : accounts.admin.id, received_at: state === "Delivered" ? iso(deliveryDate) : null,
      received_by: state === "Delivered" ? accounts.admin.id : null, receipt_notes: state === "Delivered" ? "Barang diterima lengkap dan sesuai pesanan." : null,
      order_references_snapshot: JSON.stringify(orders.map(o => o.order_number)),
      invoice_references_snapshot: JSON.stringify(indexes.map(index => tables.invoices[index].invoice_number))
    }, latestDate);
    tables.delivery_notes.push(delivery);
    for (const index of indexes) {
      const sourceId = id("delivery-source", index);
      tables.delivery_note_sources.push({ id: sourceId, delivery_note_id: delivery.id, picking_list_id: id("picking", index),
        sales_order_id: id("order", index), invoice_id: id("invoice", index) });
      tables.sales_order_items.filter(line => line.sales_order_id === id("order", index)).forEach((line, lineIndex) => {
        tables.delivery_note_items.push({ id: id("delivery-item", index * 2 + lineIndex), delivery_note_id: delivery.id,
          source_id: sourceId, picking_list_item_id: id("picking-item", index * 2 + lineIndex), product_code: line.product_sku_snapshot,
          item_name: line.item_name, ordered_quantity_snapshot: line.quantity, packed_quantity_snapshot: line.quantity,
          quantity: line.quantity, outstanding_quantity: 0, unit: "PCS", description: "Produk tekstil sesuai ukuran pesanan.", adjustment_note: null });
      });
    }
  });
  for (let index = 0; index < 8; index++) {
    const convertedIndex = index === 0 ? 26 : index === 1 ? 28 : null;
    const customerIndex = convertedIndex === null ? (index < 5 ? 14 : index + 3) : customerIndexes[convertedIndex];
    const status = index === 0 ? "ConvertedToSO" : index === 1 ? "ConvertedToCustomerPO" : index < 5 ? "Open" : index === 7 ? "Cancelled" : "Closed";
    const date = days(anchor, -4 - index);
    const inquiry = dated({ id: id("inquiry", index), inquiry_number: documentNumber("INQ", date), customer_id: tables.customers[customerIndex].id,
      inquiry_date: iso(date), needed_by: iso(days(anchor, 7 + index)), status,
      notes: "Permintaan penawaran produk tekstil dan konfirmasi waktu pengadaan.",
      status_note: convertedIndex !== null ? "Penawaran disepakati dan dilanjutkan menjadi order." : status === "Open" ? null : "Pelanggan menunda pengadaan.",
      sales_order_id: convertedIndex === null ? null : id("order", convertedIndex)
    }, date); tables.customer_inquiries.push(inquiry);
    const lines = convertedIndex === null ? [{ product_id: tables.products[index].id, item_name: tables.products[index].product_name,
      product_sku_snapshot: tables.products[index].sku, quantity: 10, final_unit_price: calculateAdjustedUnitPrice(Number(tables.products[index].list_price), 30) }] :
      tables.sales_order_items.filter(line => line.sales_order_id === id("order", convertedIndex));
    lines.forEach((line, lineIndex) => tables.customer_inquiry_items.push({ id: `demo-v1-inquiry-item-${index + 1}-${lineIndex + 1}`,
      customer_inquiry_id: inquiry.id, product_id: line.product_id, item_name: line.item_name, product_sku_snapshot: line.product_sku_snapshot,
      quantity: line.quantity, requested_unit_price: line.final_unit_price, agreed_unit_price: convertedIndex === null ? null : line.final_unit_price,
      notes: "Ukuran dan jumlah mengikuti permintaan pelanggan." }));
  }
  for (let index = 0; index < 12; index++) {
    const date = days(anchor, -index - 1);
    tables.customer_outreach.push(dated({ id: id("outreach", index), customer_id: tables.customers[index === 11 ? 14 : index].id,
      contact_date: iso(date), notes: index % 2 === 0 ? "Follow-up kebutuhan stok tikar dan kasur untuk pengadaan berikutnya." : "Pelanggan meminta informasi ukuran produk dan estimasi pengiriman."
    }, date));
  }
  [21, 22, 23, 14, 15, 16].forEach((invoiceIndex, index) => {
    const date = days(anchor, index === 4 ? -2 : index - 1);
    tables.collection_tasks.push(dated({ id: id("collection", index), customer_id: tables.invoices[invoiceIndex].customer_id,
      invoice_id: id("invoice", invoiceIndex), scheduled_date: iso(date), status: index === 4 ? "Done" : "Planned", version: 1,
      notes: index < 3 ? "Konfirmasi jadwal pelunasan invoice yang telah jatuh tempo." : "Pengingat pembayaran tahap berikutnya sesuai kesepakatan."
    }, days(anchor, -4)));
  });

  // Match normal document numbering chronology, including a demo spanning two years.
  numberCounters.clear();
  function renumber(table: string, type: string, column: string, dateColumn: string, filter: (row: DemoRow) => boolean = () => true) {
    for (const row of [...tables[table]].filter(filter).sort((a, b) => String(a[dateColumn]).localeCompare(String(b[dateColumn])) || String(a.id).localeCompare(String(b.id)))) {
      row[column] = documentNumber(type, new Date(String(row[dateColumn])));
    }
  }
  renumber("sales_orders", "SO", "order_number", "order_date");
  renumber("sales_orders", "PO", "customer_po_number", "order_date", row => row.source === "CUSTOMER_PO");
  renumber("invoices", "INV", "invoice_number", "issue_date");
  renumber("customer_inquiries", "INQ", "inquiry_number", "inquiry_date");
  renumber("delivery_notes", "SJ", "delivery_note_number", "created_at");
  for (const invoice of tables.invoices) {
    const order = tables.sales_orders.find(row => row.id === invoice.sales_order_id)!;
    invoice.order_number_snapshot = order.order_number; invoice.customer_po_number_snapshot = order.customer_po_number;
  }
  for (const picking of tables.picking_lists) picking.picking_list_number = `PL-${tables.sales_orders.find(row => row.id === picking.sales_order_id)!.order_number}`;
  for (const note of tables.delivery_notes) {
    const sources = tables.delivery_note_sources.filter(source => source.delivery_note_id === note.id);
    note.order_references_snapshot = JSON.stringify(sources.map(source => tables.sales_orders.find(row => row.id === source.sales_order_id)!.order_number));
    note.invoice_references_snapshot = JSON.stringify(sources.map(source => tables.invoices.find(row => row.id === source.invoice_id)!.invoice_number));
    note.updated_at = note.received_at ?? note.issued_at ?? note.created_at;
  }
  for (const document of result.documents) {
    const order = tables.sales_orders.find(row => row.id === document.orderId)!;
    document.number = String(order.customer_po_number); document.fileName = `${document.number}.pdf`;
    document.storedName = `demo/${DEMO_VERSION}/${anchorDate}/${document.fileName}`;
    order.customer_po_document_name = document.fileName; order.customer_po_document_stored_name = document.storedName;
  }

  function audit(actor: DemoAccounts[keyof DemoAccounts], module: string, entity: string, row: DemoRow, reference: string, action: string, summary: string, date: string) {
    tables.audit_trails.push({ id: id("audit", tables.audit_trails.length), actor_user_id: actor.id, actor_username: actor.username,
      actor_display_name: actor.displayName, actor_role: actor.role === "ADMIN" ? "Admin" : actor.role === "SALES" ? "Sales" : "Manager",
      module_name: module, entity_type: entity, entity_id: row.id, record_reference: reference, action, change_summary: summary,
      action_note: "Histori simulasi dataset demo UMKM tekstil.", old_value: null, new_value: JSON.stringify({ datasetVersion: DEMO_VERSION, reference }), created_at: date });
  }
  tables.customers.forEach(row => audit(accounts.sales, "Customers", "CUSTOMER", row, String(row.company_name), "CREATED", "Customer dan kontak pengadaan dicatat.", String(row.created_at)));
  tables.products.forEach(row => audit(accounts.admin, "Products", "PRODUCT", row, String(row.sku), "CREATED", "Produk dan biaya dasar dicatat.", String(row.created_at)));
  tables.sales_orders.forEach(row => audit(accounts.sales, row.source === "DIRECT" ? "Sales Orders" : "Customer Purchase Orders", "SALES_ORDER", row,
    String(row.order_number), "CREATED", row.approval_status === "Pending" ? "Order diajukan untuk persetujuan Manager." : "Order pelanggan dicatat.", String(row.created_at)));
  tables.invoices.forEach(row => audit(accounts.admin, "Invoices", "INVOICE", row, String(row.invoice_number), "CREATED", "Invoice diterbitkan sesuai order pelanggan.", String(row.created_at)));
  tables.payments.forEach(row => audit(accounts.admin, "Payments", "PAYMENT", row,
    String(tables.invoices.find(invoice => invoice.id === row.invoice_id)!.invoice_number), "CREATED", "Pembayaran pelanggan dicatat dan saldo invoice diperbarui.", String(row.payment_date)));
  tables.picking_lists.forEach(row => audit(accounts.admin, "Pick & Pack", "PICKING_LIST", row, String(row.picking_list_number), "STATUS_CHANGED", "Ketersediaan dan pengemasan barang diperiksa.", String(row.packed_at ?? row.created_at)));
  tables.delivery_notes.forEach(row => audit(accounts.admin, "Surat Jalan", "DELIVERY_NOTE", row, String(row.delivery_note_number), row.status === "Delivered" ? "DELIVERED" : "CREATED",
    row.status === "Delivered" ? "Penerimaan barang oleh pelanggan dicatat." : "Dokumen pengiriman disiapkan.", String(row.received_at ?? row.created_at)));
  tables.customer_inquiries.forEach(row => audit(accounts.sales, "Customer Inquiry", "CUSTOMER_INQUIRY", row, String(row.inquiry_number), "CREATED", "Permintaan penawaran pelanggan dicatat.", String(row.created_at)));
  for (const [key, value] of numberCounters) { const [type, year] = key.split(":"); tables.document_sequences.push({ document_type: type, year: Number(year), last_value: value, updated_at: iso(anchor) }); }
  verifyDemoDataset(result);
  return result;
}

export function verifyDemoDataset(dataset: DemoDataset) {
  const t = dataset.tables; const anchor = new Date(`${dataset.anchorDate}T12:00:00+07:00`);
  requireValue(t.customers.length === 15 && t.products.length === 10 && t.sales_orders.length === 30 && t.invoices.length === 24, "unexpected baseline size");
  requireValue(t.sales_orders.filter(row => row.source === "CUSTOMER_PO").length === 8 && dataset.documents.length === 8, "PO count mismatch");
  const sourceById = new Map(t.sales_orders.map(row => [row.id, row]));
  for (const invoice of t.invoices) {
    const order = sourceById.get(invoice.sales_order_id)!;
    requireValue(order && invoice.customer_id === order.customer_id && invoice.total_amount === order.total, "invoice/order mismatch");
    const paid = t.payments.filter(row => row.invoice_id === invoice.id).reduce((sum, row) => sum + Number(row.amount), 0);
    requireValue(paid === invoice.paid_amount && Number(invoice.remaining_amount) + paid === invoice.total_amount, "payment balance mismatch");
    requireValue(Number(invoice.ppn_amount) + Number(invoice.net_sales_amount) === invoice.total_amount && invoice.ppn_amount === order.ppn_amount, "tax snapshot mismatch");
    requireValue((invoice.status === "Overdue") === (Number(invoice.remaining_amount) > 0 && new Date(String(invoice.due_date)) < anchor), "due date/status mismatch");
    requireValue(Array.isArray(invoice.items_snapshot) && invoice.items_snapshot.length > 0, "empty invoice snapshot");
    for (const payment of t.payments.filter(row => row.invoice_id === invoice.id)) {
      requireValue(Number(payment.amount) > 0 && new Date(String(payment.payment_date)) >= new Date(String(invoice.issue_date)) && new Date(String(payment.payment_date)) <= anchor, `invalid payment chronology for ${invoice.invoice_number}`);
    }
  }
  for (const order of t.sales_orders) {
    const lines = t.sales_order_items.filter(line => line.sales_order_id === order.id);
    requireValue(lines.length > 0 && lines.reduce((sum, line) => sum + Number(line.subtotal), 0) === order.total, "order items do not reconcile");
    requireValue(Number(order.ppn_amount) + Number(order.net_sales_amount) === order.total, "order tax does not reconcile");
    requireValue(order.payment_term_type !== "IMMEDIATE" || (order.credit_term_months === null && order.credit_term_weeks === null), "Immediate order has credit duration");
    if (order.approval_status === "Pending") {
      requireValue(!t.invoices.some(invoice => invoice.sales_order_id === order.id), "pending order already invoiced");
      requireValue(t.invoices.some(invoice => invoice.customer_id === order.customer_id && Number(invoice.remaining_amount) > 0 &&
        t.delivery_note_sources.some(source => source.invoice_id === invoice.id && t.delivery_notes.some(note => note.id === source.delivery_note_id && note.status === "Delivered"))), "pending order has no delivered outstanding evidence");
    }
  }
  for (const source of t.delivery_note_sources) {
    const note = t.delivery_notes.find(row => row.id === source.delivery_note_id)!;
    const invoice = t.invoices.find(row => row.id === source.invoice_id)!;
    const picking = t.picking_lists.find(row => row.id === source.picking_list_id)!;
    requireValue(note && invoice && picking && note.customer_id === invoice.customer_id && invoice.sales_order_id === source.sales_order_id && picking.sales_order_id === source.sales_order_id, "delivery source mismatch");
  }
  for (const inquiry of t.customer_inquiries.filter(row => row.sales_order_id)) {
    const order = sourceById.get(inquiry.sales_order_id)!;
    requireValue(order && order.customer_id === inquiry.customer_id && new Date(String(inquiry.inquiry_date)) <= new Date(String(order.order_date)), "inquiry conversion mismatch");
  }
  return { version: dataset.version, anchorDate: dataset.anchorDate,
    counts: Object.fromEntries(Object.entries(t).filter(([table]) => !table.startsWith("dashboard") && table !== "users").map(([table, rows]) => [table, rows.length])),
    invoiceStatuses: Object.fromEntries(["Paid", "Partial", "Unpaid", "Overdue"].map(status => [status, t.invoices.filter(row => row.status === status).length])),
    orderSources: { DIRECT: 22, CUSTOMER_PO: 8 }, pendingApprovals: t.sales_orders.filter(row => row.approval_status === "Pending").length,
    totalInvoiceValue: t.invoices.reduce((sum, row) => sum + Number(row.total_amount), 0),
    paidInvoiceValue: t.invoices.reduce((sum, row) => sum + Number(row.paid_amount), 0),
    outstandingInvoiceValue: t.invoices.reduce((sum, row) => sum + Number(row.remaining_amount), 0) };
}
