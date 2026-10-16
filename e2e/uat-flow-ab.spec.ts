import { PrismaClient, type User, type Product, type Customer, type SalesOrder, type Invoice, type PickingList, type DeliveryNote } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot, parseInvoiceItemSnapshots } from "../src/lib/invoice-snapshot";
import { buildOrderTaxSnapshot } from "../src/lib/tax";
import { formatCurrency, formatInvoiceCurrency, formatDate } from "../src/lib/format";
import { toBusinessDateInputWib } from "../src/lib/business-clock";
import { toJakartaDateTimeInputValue } from "../src/lib/delivery-note-status";

const db = new PrismaClient();
const out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-flow-ab-2026-10-15";
const password = "UAT-AB-Simulation-Only-123!";
const users: Record<string, User> = {};
let products: Product[], customerA: Customer, customerB: Customer;
let orderA: SalesOrder, invoiceA: Invoice, pickA: PickingList, noteA: DeliveryNote;
let orderB: SalesOrder, invoiceB: Invoice, oldInvoiceB: Invoice;
const poNumber = "PO-UAT-B-2026-001", requiredInitial = "2026-10-22", requiredRevised = "2026-10-25";
type Finding = { id: string; severity: string; title: string; [key: string]: unknown };
type Step = { no: number; role: string; title: string; status: string; checkpoints: Record<string, unknown>[];
  findings: Finding[]; error?: string; started: string; seconds?: number };
let current: Step;
const steps: Step[] = [], runtimeErrors: string[] = [];
function save() {
  const group = current?.no <= 14 ? "flow-a-continuation" : "flow-b";
  writeFileSync(`${out}/${group}-evidence.json`, JSON.stringify({ scope: "UAT steps 11-20", method: "Real role logins, UI actions, isolated database and private Storage bucket",
    prerequisites: "Equivalent end-of-step-10 Paid invoice and Completed Pick are seeded; previous test schema was removed. B has a separate historical Delivered invoice with Rp3m outstanding.",
    steps, runtimeErrors }, null, 2));
}
function checkpoint(name: string, data: Record<string, unknown> = {}) { current.checkpoints.push({ name, ...data }); save(); }
function finding(data: Finding) { current.findings.push(data); save(); }
async function shot(page: Page, name: string) {
  const screenshot = `${out}/${current.no}-${name}.png`; await page.screenshot({ path: screenshot, fullPage: true });
  checkpoint(name, { screenshot, url: page.url() });
}
async function runStep(page: Page, no: number, role: string, title: string, action: () => Promise<void>) {
  current = { no, role, title, status: "running", checkpoints: [], findings: [], started: new Date().toISOString() };
  steps.push(current); save(); const start = Date.now();
  try { await action(); current.status = current.findings.length ? "passed_with_findings" : "passed"; }
  catch(error) {
    current.status = "failed"; current.error = error instanceof Error ? error.message : String(error);
    try { await shot(page, "failure"); writeFileSync(`${out}/${no}-failure-body.txt`, await page.locator("body").innerText()); } catch { /* preserve failure */ }
  } finally { current.seconds = Math.round((Date.now()-start)/100)/10; save(); }
  console.log(`Step ${no}: ${current.status} (${current.seconds}s) ${title}${current.error ? `: ${current.error.slice(0, 420)}` : ""}`);
}
async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3137/"); await page.waitForLoadState("networkidle");
}
async function submit(page: Page, trigger: Locator, note = "Simulasi UAT langkah 11-20") {
  await page.waitForLoadState("networkidle");
  const sent = page.waitForResponse(r=>r.request().method()==="POST" && Boolean(r.request().headers()["next-action"]), { timeout: 60_000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /^Confirm / });
  const mode = await Promise.race([dialog.waitFor({ state: "visible", timeout: 5_000 }).then(()=>"confirm").catch(()=>"none"), sent.then(()=>"sent")]);
  if (mode === "confirm") {
    await dialog.getByRole("textbox").fill(note); await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  }
  expect((await sent).status()).toBeLessThan(400); await expect(dialog).toBeHidden(); await page.waitForLoadState("networkidle");
}
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function pdf(lines: string[]) {
  const stream = `BT /F1 12 Tf 55 780 Td 18 TL ${lines.map((line, i)=>`${i ? "T* " : ""}(${line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")}) Tj`).join("\n")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let content = "%PDF-1.4\n"; const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(content)); content += `${i+1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
const initialPdf = pdf(["UAT SIMULATION - ORIGINAL CUSTOMER PO", poNumber, "Customer: PT UAT Pelanggan B", `Required date: ${requiredInitial}`,
  "Produk A UAT: 4 x Rp100000", "Produk B UAT: 2 x Rp200000", "Total: Rp800000", "Payment terms: Credit 3 Months"]);
const revisedPdf = pdf(["UAT SIMULATION - REVISED CUSTOMER PO", poNumber, "Customer: PT UAT Pelanggan B", `Required date: ${requiredRevised}`,
  "Produk A UAT: 4 x Rp100000", "Produk B UAT: 3 x Rp200000", "Total: Rp1000000", "Payment terms: Credit 3 Months"]);

test.beforeAll(async () => {
  const schema = process.env.SIT_UMKM_SCHEMA;
  if (!schema || !/^sit_umkm_[a-f0-9_]+$/.test(schema)) throw new Error("Isolated UAT runner required");
  const [scope] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`; expect(scope.schema).toBe(schema);
  for (const role of ["ADMIN", "SALES", "MANAGER"] as const) users[role] = await db.user.upsert({ where: { username: `uat_ab_${role.toLowerCase()}` }, update: {},
    create: { username: `uat_ab_${role.toLowerCase()}`, displayName: `UAT AB ${role}`, role, passwordHash: hashPassword(password) } });
  products = await Promise.all([70000,140000].map((cost,i)=>db.product.upsert({ where: { sku: `UAT-AB-${i+1}` }, update: {}, create: {
    sku: `UAT-AB-${i+1}`, productName: `Produk ${i ? "B" : "A"} UAT`, listPrice: cost, status: "Active"
  } })));
  async function customer(key: string) {
    return await db.customer.findFirst({ where: { companyName: `PT UAT Pelanggan ${key}` } }) ?? db.customer.create({ data: {
      name: `Ibu Rina UAT ${key}`, companyName: `PT UAT Pelanggan ${key}`, phone: "081234567890", email: `uat-${key.toLowerCase()}@example.test`,
      address: `Jl. Simulasi Pelanggan ${key} 15, Jakarta`, customerSegment: "Retail", portfolioOwnerUserId: users.SALES.id,
      npwp: key === "B" ? "9000000000000002" : null, notes: "Data fiktif UAT 11-20"
    } });
  }
  customerA = await customer("A"); customerB = await customer("B");
  let a = await db.salesOrder.findUnique({ where: { orderNumber: "SO-UAT-A-CONT" }, include: { items: true, customer: true, invoice: true, pickingList: true } });
  if (!a) {
    a = await db.salesOrder.create({ data: { orderNumber: "SO-UAT-A-CONT", customerId: customerA.id, createdByUserId: users.SALES.id,
      status: "Invoiced", total: 1870000, subtotal: 1870000, netSalesAmount: 1870000, orderDate: new Date("2026-10-15T03:00:00Z"),
      paymentTermType: "IMMEDIATE", deliveryDestinationSnapshot: customerA.address, packStartedAt: new Date(Date.now()-3600000),
      items: { create: [
        { productId: products[0].id, productSkuSnapshot: products[0].sku, itemName: products[0].productName, quantity: 14, baseUnitPrice: 100000, markupPercent: 5, finalUnitPrice: 105000, subtotal: 1470000 },
        { productId: products[1].id, productSkuSnapshot: products[1].sku, itemName: products[1].productName, quantity: 2, baseUnitPrice: 250000, discountPercent: 20, finalUnitPrice: 200000, subtotal: 400000 }
      ] } }, include: { items: true, customer: true, invoice: true, pickingList: true } });
    a.invoice = await db.invoice.create({ data: { invoiceNumber: "INV-UAT-A-CONT", customerId: customerA.id, salesOrderId: a.id,
      issueDate: new Date("2026-10-15T03:00:00Z"), dueDate: new Date("2026-10-15T03:00:00Z"), paymentTermType: "IMMEDIATE",
      totalAmount: 1870000, paidAmount: 1870000, remainingAmount: 0, netSalesAmount: 1870000, status: "Paid", ...buildInvoiceSnapshot(a) } });
    await db.payment.createMany({ data: [750000,1120000].map(amount=>({ invoiceId: a!.invoice!.id, paymentDate: new Date("2026-10-15T04:00:00Z"), amount, paymentMethod: "BankTransfer", notes: "Prasyarat UAT lanjutan alur A" })) });
    a.pickingList = await db.pickingList.create({ data: { pickingListNumber: "PL-UAT-A-CONT", salesOrderId: a.id, status: "Packed", usesChecklist: true,
      pickerName: "Bapak Dedi UAT", packerName: "Bapak Dedi UAT", packedAt: new Date(Date.now()-600000),
      items: { create: a.items.map(item=>({ salesOrderItemId: item.id, itemName: item.itemName, orderedQuantity: item.quantity,
        availableQuantity: item.quantity, packedQuantity: item.quantity, isChecked: true, availabilityStatus: "Available" })) } } });
  }
  orderA = a; invoiceA = a.invoice!; pickA = a.pickingList!;
  let old = await db.salesOrder.findUnique({ where: { orderNumber: "SO-UAT-B-OLD" }, include: { customer: true, items: true, invoice: true } });
  if (!old) {
    old = await db.salesOrder.create({ data: { orderNumber: "SO-UAT-B-OLD", customerId: customerB.id, createdByUserId: users.SALES.id,
      status: "Shipped", orderDate: new Date("2026-10-01T03:00:00Z"), paymentTermType: "CREDIT", creditTermWeeks: 1,
      total: 5000000, subtotal: 5000000, ...buildOrderTaxSnapshot({ totalAmount: 5000000, customerNpwp: customerB.npwp }), deliveryDestinationSnapshot: customerB.address,
      items: { create: { productId: products[0].id, itemName: products[0].productName, quantity: 100, baseUnitPrice: 50000, finalUnitPrice: 50000, subtotal: 5000000 } }
    }, include: { customer: true, items: true, invoice: true } });
    old.invoice = await db.invoice.create({ data: { invoiceNumber: "INV-UAT-B-OLD", salesOrderId: old.id, customerId: customerB.id,
      issueDate: new Date("2026-10-01T03:00:00Z"), dueDate: new Date("2026-10-08T03:00:00Z"), paymentTermType: "CREDIT", creditTermWeeks: 1,
      totalAmount: 5000000, paidAmount: 2000000, remainingAmount: 3000000, status: "Partial",
      ...buildOrderTaxSnapshot({ totalAmount: 5000000, customerNpwp: customerB.npwp }), ...buildInvoiceSnapshot(old) } });
    await db.payment.create({ data: { invoiceId: old.invoice.id, amount: 2000000, paymentDate: new Date("2026-10-02T03:00:00Z"), paymentMethod: "BankTransfer", notes: "Prasyarat outstanding pelanggan B" } });
    await db.deliveryNote.create({ data: { deliveryNoteNumber: "SJ-UAT-B-OLD", salesOrderId: old.id, invoiceId: old.invoice.id, customerId: customerB.id,
      deliveryDate: new Date("2026-10-02T00:00:00Z"), status: "Delivered", recipientName: customerB.name, recipientPhone: customerB.phone,
      recipientAddress: customerB.address, receiverName: "Penerima UAT B historis", receivedAt: new Date("2026-10-02T05:00:00Z"), receivedBy: "Fixture UAT" } });
  }
  oldInvoiceB = old.invoice!;
  writeFileSync(`${out}/po-b-original.pdf`, initialPdf); writeFileSync(`${out}/po-b-revised.pdf`, revisedPdf);
});
test.afterAll(async()=>db.$disconnect());

test("Alur A 11-14 reopen Pack Draft Surat Jalan Dikirim dan Diterima", async ({ page }) => {
  page.on("pageerror", error=>{ runtimeErrors.push(error.message); save(); });
  await runStep(page, 11, "Manager", "Reopen Completed dengan alasan, reset dan selesaikan ulang lalu cetak tanpa harga", async()=>{
    await login(page,"MANAGER"); await page.goto(`/pick-pack?tab=completed&view=${pickA.id}`);
    const reason = "UAT11: pemeriksaan ulang Manager sebelum pengiriman; belum ada Surat Jalan";
    expect(await db.deliveryNote.count({ where: { OR: [{ salesOrderId: orderA.id }, { sources: { some: { salesOrderId: orderA.id } } }] } })).toBe(0);
    await submit(page,page.getByRole("button",{name:"Reopen",exact:true}),reason);
    let saved = await db.pickingList.findUniqueOrThrow({ where: { id: pickA.id }, include: { items: true } });
    expect(saved).toMatchObject({ status: "InProgress", packedAt: null, packerName: null }); expect(saved.items.every(item=>!item.isChecked)).toBe(true);
    const audits = await db.auditTrail.findMany({ where: { entityId: pickA.id, action: "REOPENED" } });
    expect(JSON.stringify(audits)).toContain(reason); checkpoint("reopened-reset-and-reason",{ pick: saved, audits });
    await page.goto(`/pick-pack?view=${pickA.id}`);
    await expect(page.locator('input[name="checkedItemId"]:checked')).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Selesaikan Pick & Pack",exact:true})).toBeDisabled();
    await shot(page,"reset-after-reopen");
    for (const check of await page.locator('input[name="checkedItemId"]').all()) await check.check();
    await page.locator('input[name="pickerName"]').fill("Bapak Dedi UAT - diperiksa ulang Manager");
    await submit(page,page.getByRole("button",{name:"Selesaikan Pick & Pack",exact:true}));
    saved = await db.pickingList.findUniqueOrThrow({ where: { id: pickA.id }, include: { items: true } });
    expect(saved.status).toBe("Packed"); expect(saved.items.every(item=>item.isChecked && item.packedQuantity===item.orderedQuantity)).toBe(true);
    checkpoint("recompleted",{ pick: saved }); await page.goto(`/pick-pack?tab=completed&view=${pickA.id}`);
    await page.getByRole("link",{name:"Print Pick & Pack",exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/pick-pack/${pickA.id}/print$`));
    await expect(page.locator("article")).toContainText("Completed");
    await expect(page.locator("article")).not.toContainText(/Rp|Price|Subtotal/);
    await expect(page.locator("article tbody tr")).toHaveCount(2);
    await page.emulateMedia({media:"print"}); await page.pdf({path:`${out}/11-recompleted-pick.pdf`,format:"A4",printBackground:true});
    await page.emulateMedia({media:"screen"}); await shot(page,"final-pick-print");
  });
  await runStep(page, 12, "Admin", "Draft SJ-A lengkap, kontak diperbarui tanpa mengubah kuantitas", async()=>{
    await login(page,"ADMIN"); await page.goto(`/surat-jalan?mode=create&pickingListId=${pickA.id}`);
    const form = page.locator("form").filter({has:page.locator('select[name="deliveryAssignmentId"]')});
    const destination = form.getByRole("combobox",{name:"Customer / delivery destination",exact:true});
    await destination.selectOption({label:`${customerA.companyName} — ${customerA.address}`});
    for (const all of await form.getByRole("button",{name:"Select all ready items",exact:true}).all()) await all.click();
    await form.locator('input[name="recipientName"]').fill("Ibu Sari UAT Gudang A");
    await form.locator('input[name="recipientPhone"]').fill("081234560001");
    await form.locator('input[name="deliveryDate"]').fill(toBusinessDateInputWib(new Date()));
    await form.locator('input[name="senderName"]').fill("Admin Rina UAT");
    await form.locator('input[name="authorizedBy"]').fill("Manager Arif UAT");
    await form.locator('select[name="deliveryAssignmentId"]').selectOption("budi-b1234");
    await form.locator('input[name="notes"]').fill("UAT: Hubungi penerima sebelum tiba.");
    await submit(page,form.getByRole("button",{name:"Create Draft Surat Jalan",exact:true}));
    const saved = await db.deliveryNote.findFirstOrThrow({where:{OR:[{salesOrderId:orderA.id},{sources:{some:{salesOrderId:orderA.id}}}]},include:{items:true,sources:true}});
    noteA=saved; expect(saved).toMatchObject({status:"Draft",recipientName:"Ibu Sari UAT Gudang A",senderName:"Admin Rina UAT",driverName:"Budi Santoso",vehiclePlateNumber:"B 1234 TJK"});
    expect(saved.items.map(item=>item.quantity).sort((a,b)=>a-b)).toEqual([2,14]); checkpoint("draft-created",{note:saved});
    const sourceItems=await db.salesOrderItem.findMany({where:{salesOrderId:orderA.id},select:{itemName:true,productSkuSnapshot:true,productId:true}});
    checkpoint("source-product-codes",{sourceItems,deliveryCodes:saved.items.map(item=>({itemName:item.itemName,productCode:item.productCode}))});
    const missingCodes=saved.items.flatMap(item=>{
      const source=sourceItems.find(row=>row.itemName===item.itemName);
      return source?.productSkuSnapshot && item.productCode!==source.productSkuSnapshot ? [{itemName:item.itemName,expected:source.productSkuSnapshot,actual:item.productCode}] : [];
    });
    if(missingCodes.length) finding({id:"AB-SKU-01",severity:"P3",title:"SKU produk pada SO tidak diteruskan ke Surat Jalan",missingCodes});
    await page.goto(`/surat-jalan?view=${noteA.id}`);
    const draft=page.locator("form").filter({has:page.locator(`input[name="id"][value="${noteA.id}"]`)});
    await draft.locator('input[name="recipientName"]').fill("Ibu Sari UAT - Penerima Revisi");
    await draft.locator('input[name="recipientPhone"]').fill("081234560099");
    await draft.locator('select[name="deliveryAssignmentId"]').selectOption("andi-b5678");
    await draft.locator('input[name="confirmationNote"]').fill("UAT12: pembaruan kontak dan penugasan pengiriman pada Draft");
    await submit(page,draft.getByRole("button",{name:"Simpan Draft",exact:true}),"UAT12: pembaruan kontak dan penugasan pengiriman pada Draft");
    const updated=await db.deliveryNote.findUniqueOrThrow({where:{id:noteA.id},include:{items:true}});
    expect(updated).toMatchObject({status:"Draft",recipientName:"Ibu Sari UAT - Penerima Revisi",recipientPhone:"081234560099",driverName:"Andi Pratama",vehiclePlateNumber:"B 5678 CVT"});
    expect(updated.items.map(item=>item.quantity).sort((a,b)=>a-b)).toEqual([2,14]);
    noteA=updated; checkpoint("draft-contacts-saved-same-quantities",{note:updated});
    await page.goto(`/surat-jalan?view=${noteA.id}`); await shot(page,"draft-updated");
  });
  await runStep(page, 13, "Admin + Sales", "SJ-A Dikirim dan terkunci; Sales mencetak referensi SO dan invoice yang benar", async()=>{
    await login(page,"ADMIN"); await page.goto(`/surat-jalan?view=${noteA.id}`); await page.waitForLoadState("networkidle");
    await page.getByRole("button",{name:"Kirim Surat Jalan",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Kirim Surat Jalan?",exact:true})).toBeVisible();
    await submit(page,page.getByRole("button",{name:"Ya, Kirim & Kunci",exact:true}));
    const issued=await db.deliveryNote.findUniqueOrThrow({where:{id:noteA.id},include:{items:true,sources:true}});
    expect(issued).toMatchObject({status:"Issued",issuedAt:expect.any(Date),issuedBy:expect.any(String)});
    expect(issued.items.map(item=>item.quantity).sort((a,b)=>a-b)).toEqual([2,14]); noteA=issued;
    checkpoint("issued-final",{note:issued}); await page.goto(`/surat-jalan?view=${noteA.id}`);
    await expect(page.locator('input[name="recipientPhone"]')).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Simpan Draft",exact:true})).toHaveCount(0);
    await expect(page.locator("body")).toContainText("Dikirim"); await shot(page,"issued-locked");
    await login(page,"SALES"); await page.goto(`/surat-jalan?view=${noteA.id}`);
    await page.getByRole("link",{name:"Cetak",exact:true}).first().click();
    await expect(page).toHaveURL(new RegExp(`/surat-jalan/${noteA.id}/print$`));
    const article=page.locator("article"); await expect(article).toContainText(orderA.orderNumber);
    await expect(article).toContainText(invoiceA.invoiceNumber); await expect(article).toContainText("Andi Pratama");
    await expect(article.getByRole("row").filter({hasText:products[0].productName})).toContainText("14");
    await expect(article.getByRole("row").filter({hasText:products[1].productName})).toContainText("2");
    await expect(article).not.toContainText(/Rp|Unit Price|Invoice Total/);
    checkpoint("issued-print-product-codes",{rows:await article.locator("tbody tr").allTextContents(),expectedSkus:products.map(product=>product.sku)});
    await page.emulateMedia({media:"print"}); await page.pdf({path:`${out}/13-sj-sales.pdf`,format:"A4",printBackground:true});
    await page.emulateMedia({media:"screen"}); await shot(page,"sj-sales-print");
    const search=article.getByRole("searchbox",{name:"Search rows containing this text",exact:true});
    if (await search.count()) {
      await search.fill(products[0].productName); await page.emulateMedia({media:"print"});
      const rows=await article.locator("tbody tr").evaluateAll(elements=>elements.map(row=>({text:row.textContent,display:getComputedStyle(row).display})));
      if(rows.filter(row=>row.display!=="none").length!==2) finding({id:"AB-PRINT-01",severity:"P2",title:"Bug filter cetak yang diketahui juga memengaruhi Surat Jalan",rows,relatedExistingBug:"FLOW-A-02"});
      await page.pdf({path:`${out}/13-sj-filtered.pdf`,format:"A4",printBackground:true});
      await page.screenshot({path:`${out}/13-sj-filtered-print-media.png`,fullPage:true});
      await page.emulateMedia({media:"screen"}); checkpoint("sj-print-filter-probe",{rows});
    }
  });
  await runStep(page, 14, "Admin", "SJ-A Diterima dengan penerima dan waktu WIB yang sesuai; invoice tetap lunas", async()=>{
    await login(page,"ADMIN"); await page.goto(`/surat-jalan?view=${noteA.id}`); await page.waitForLoadState("networkidle");
    await page.getByRole("button",{name:"Tandai Sudah Diterima",exact:true}).first().click();
    const dialog=page.getByRole("dialog",{name:"Konfirmasi Barang Diterima",exact:true});
    const localTime=toJakartaDateTimeInputValue(new Date()), expectedTime=new Date(`${localTime}+07:00`);
    await dialog.locator('input[name="receiverName"]').fill("Ibu Sari UAT Penerima Aktual");
    await dialog.locator('input[name="receivedAt"]').fill(localTime);
    await dialog.locator('textarea[name="receiptNotes"]').fill("UAT-BUKTI-A-014: diterima lengkap, 14 Produk A dan 2 Produk B, kondisi baik.");
    await shot(page,"receipt-confirmation");
    await submit(page,dialog.getByRole("button",{name:"Konfirmasi Diterima",exact:true}));
    const delivered=await db.deliveryNote.findUniqueOrThrow({where:{id:noteA.id}});
    expect(delivered).toMatchObject({status:"Delivered",receiverName:"Ibu Sari UAT Penerima Aktual",receivedAt:expectedTime});
    const paid=await db.invoice.findUniqueOrThrow({where:{id:invoiceA.id}}); expect(paid).toMatchObject({status:"Paid",remainingAmount:0,paidAmount:1870000});
    checkpoint("delivered-and-still-paid",{note:delivered,enteredWib:localTime,expectedUtc:expectedTime,invoice:paid});
    await page.goto(`/surat-jalan?tab=completed&view=${noteA.id}`);
    await expect(page.locator("body")).toContainText("Diterima"); await expect(page.locator("body")).toContainText("Ibu Sari UAT Penerima Aktual");
    const audits=await db.auditTrail.findMany({where:{entityId:noteA.id,action:"DELIVERED"}}); expect(audits).toHaveLength(1);
    checkpoint("receipt-audit",{audits}); await shot(page,"received-completed");
  });
  expect(steps.filter(step=>step.no<=14&&step.status==="failed").map(step=>`${step.no}: ${step.error}`)).toEqual([]);
  expect(steps.filter(step=>step.no<=14).flatMap(step=>step.findings)).toEqual([]);
});

test("Alur B 15-20 Customer PO kredit Pending revisi PDF approval invoice dan PPN", async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,15,"Sales","PO-B Rp800.000 Credit 3 Months Draft/Pending dengan nomor PDF dan tanggal",async()=>{
    await login(page,"SALES"); await page.goto(`/customers?view=${customerB.id}`);
    await expect(page.locator("body")).toContainText(formatCurrency(3000000)); await expect(page.locator("body")).toContainText("Outstanding");
    checkpoint("customer-outstanding-prerequisite",{oldInvoice:oldInvoiceB.invoiceNumber,remaining:3000000,npwp:customerB.npwp});
    await page.goto("/customer-purchase-orders?mode=create");
    const form=page.locator("form").filter({has:page.locator('input[name="items"]')});
    await form.locator('select[name="customerId"]').selectOption(customerB.id);
    await form.locator('input[name="customerPoNumber"]').fill(poNumber); await form.locator('input[name="requiredDate"]').fill(requiredInitial);
    await form.locator('input[name="customerPoDocument"]').setInputFiles({name:"po-b-original.pdf",mimeType:"application/pdf",buffer:initialPdf});
    await form.locator('select[name="paymentTermType"]').selectOption("CREDIT"); await form.locator('select[name="creditTerm"]').selectOption("3m");
    await form.locator('input[name="notes"]').fill("UAT PO-B kredit tiga bulan; pelanggan memiliki outstanding sebelumnya");
    for(let i=0;i<2;i++) {
      if(i) await form.getByRole("button",{name:"Add Item",exact:true}).click();
      await form.getByRole("combobox",{name:"Product Name",exact:true}).nth(i).selectOption(products[i].id);
      await form.getByRole("spinbutton",{name:"Qty",exact:true}).nth(i).fill(i?"2":"4");
      await form.getByRole("spinbutton",{name:"Base Unit Price",exact:true}).nth(i).fill(i?"200000":"100000");
    }
    await expect(form).toContainText(formatCurrency(800000)); await shot(page,"po-credit-form");
    await submit(page,form.getByRole("button",{name:"Create Customer PO",exact:true}));
    const saved=await db.salesOrder.findFirstOrThrow({where:{customerPoNumber:poNumber,customerId:customerB.id},include:{items:true,invoice:true}}); orderB=saved;
    expect(saved).toMatchObject({source:"CUSTOMER_PO",customerPoNumber:poNumber,total:800000,status:"Draft",approvalStatus:"Pending",paymentTermType:"CREDIT",creditTermMonths:3,creditTermWeeks:null,invoice:null,customerPoDocumentName:"po-b-original.pdf"});
    expect(toBusinessDateInputWib(saved.requiredDate!)).toBe(requiredInitial); expect(saved.customerPoDocumentSha256).toBe(sha256(initialPdf));
    checkpoint("pending-po-created",{order:saved}); await page.goto(`/customer-purchase-orders/${orderB.id}`); await shot(page,"pending-po-detail");
  });
  await runStep(page,16,"Sales","Revisi tanggal dan PDF pada PO Draft tanpa mengubah nomor pelanggan kredit dan Pending",async()=>{
    await login(page,"SALES"); await page.goto(`/customer-purchase-orders/${orderB.id}`);
    const form=page.locator("form").filter({has:page.locator('input[name="requiredDate"]')});
    const initialDisplayed=await form.locator('input[name="requiredDate"]').inputValue(); checkpoint("draft-date-before-edit",{displayed:initialDisplayed,expected:requiredInitial});
    if(initialDisplayed!==requiredInitial) finding({id:"AB-DATE-01",severity:"P2",title:"Tanggal kebutuhan Draft bergeser saat membuka editor",displayed:initialDisplayed,expected:requiredInitial});
    await form.locator('input[name="requiredDate"]').fill(requiredRevised);
    await form.locator('input[name="customerPoDocument"]').setInputFiles({name:"po-b-revised.pdf",mimeType:"application/pdf",buffer:revisedPdf});
    await form.locator('input[name="confirmationNote"]').fill("UAT16: tanggal dan PDF direvisi oleh pelanggan sebelum persetujuan");
    const previousPath=orderB.customerPoDocumentStoredName;
    await submit(page,form.getByRole("button",{name:"Save Draft Metadata",exact:true}),"UAT16: tanggal dan PDF direvisi oleh pelanggan sebelum persetujuan");
    const updated=await db.salesOrder.findUniqueOrThrow({where:{id:orderB.id},include:{invoice:true}});
    expect(updated).toMatchObject({customerPoNumber:poNumber,customerId:customerB.id,paymentTermType:"CREDIT",creditTermMonths:3,status:"Draft",approvalStatus:"Pending",total:800000,customerPoDocumentName:"po-b-revised.pdf",invoice:null});
    expect(toBusinessDateInputWib(updated.requiredDate!)).toBe(requiredRevised); expect(updated.customerPoDocumentSha256).toBe(sha256(revisedPdf));
    expect(updated.customerPoDocumentStoredName).not.toBe(previousPath); orderB=updated;
    checkpoint("metadata-revised",{order:updated,previousPath,originalSha256:sha256(initialPdf),revisedSha256:sha256(revisedPdf)});
    await page.goto(`/customer-purchase-orders/${orderB.id}`); await expect(page.locator('input[name="requiredDate"]')).toHaveValue(requiredRevised);
    await expect(page.locator("body")).toContainText("po-b-revised.pdf"); await shot(page,"metadata-revised");
  });
  await runStep(page,17,"Sales","Kuantitas PO A4 B3 total Rp1.000.000 tetap Draft/Pending tanpa invoice dan alasan tercatat",async()=>{
    await login(page,"SALES"); await page.goto(`/customer-purchase-orders/${orderB.id}`);
    const editor=page.locator(`[data-order-item-editor="${orderB.id}"]`);
    await editor.getByRole("button",{name:"Edit Barang",exact:true}).click();
    const selects=editor.getByRole("combobox"); const bIndex=(await selects.nth(0).inputValue())===products[1].id?0:1;
    await editor.getByRole("spinbutton",{name:`Qty ${bIndex+1}`,exact:true}).fill("3");
    await editor.getByRole("button",{name:"Simpan Perubahan",exact:true}).click();
    const dialog=page.getByRole("dialog"); await expect(dialog).toBeVisible(); await expect(dialog).toContainText(formatCurrency(1000000));
    const reason="UAT17: pelanggan menambah Produk B dari 2 menjadi 3 sebelum approval";
    await dialog.getByRole("textbox").fill(reason); await shot(page,"po-quantity-confirmation");
    await dialog.getByRole("button",{name:"Submit",exact:true}).click(); await expect(editor).toContainText("Perubahan barang tersimpan");
    const updated=await db.salesOrder.findUniqueOrThrow({where:{id:orderB.id},include:{items:true,invoice:true}});
    expect(updated).toMatchObject({status:"Draft",approvalStatus:"Pending",total:1000000,invoice:null,customerPoNumber:poNumber,creditTermMonths:3});
    expect(updated.items.find(item=>item.productId===products[0].id)).toMatchObject({quantity:4,finalUnitPrice:100000});
    expect(updated.items.find(item=>item.productId===products[1].id)).toMatchObject({quantity:3,finalUnitPrice:200000});
    const audits=await db.auditTrail.findMany({where:{entityId:orderB.id}}); expect(JSON.stringify(audits)).toContain(reason);
    orderB=updated; checkpoint("po-items-revised",{order:updated,audits}); await shot(page,"po-quantity-saved");
  });
  await runStep(page,18,"Sales","Unduh PDF revisi terbaru dan cocokkan nomor tanggal barang dan total PO",async()=>{
    await login(page,"SALES"); await page.goto(`/customer-purchase-orders/${orderB.id}`);
    await expect(page.locator("body")).toContainText(poNumber); await expect(page.locator("body")).toContainText(formatCurrency(1000000));
    await expect(page.locator("body")).toContainText("po-b-revised.pdf"); await expect(page.locator('input[name="requiredDate"]')).toHaveValue(requiredRevised);
    const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("link",{name:"Unduh Customer PO Document",exact:true}).click()]);
    const file=`${out}/18-downloaded-${download.suggestedFilename()}`; await download.saveAs(file);
    const bytes=readFileSync(file); expect(bytes).toEqual(revisedPdf); expect(bytes).not.toEqual(initialPdf);
    expect(bytes.toString()).toContain("REVISED CUSTOMER PO"); expect(bytes.toString()).toContain("Produk B UAT: 3"); expect(bytes.toString()).toContain("Rp1000000");
    checkpoint("latest-pdf-downloaded",{file,sha256:sha256(bytes),matchesRevised:true,name:download.suggestedFilename(),po:poNumber,required:requiredRevised,total:1000000});
    await shot(page,"po-pdf-downloaded");
  });
  await runStep(page,19,"Manager","Tinjau outstanding lalu Approve PO; invoice dan pengingat kredit otomatis tercatat",async()=>{
    await login(page,"MANAGER"); await page.goto(`/customers?view=${customerB.id}`);
    await expect(page.locator("body")).toContainText(formatCurrency(3000000)); await shot(page,"manager-outstanding-review");
    await page.goto(`/invoices?view=${oldInvoiceB.id}`); await expect(page.locator("body")).toContainText("Overdue");
    await expect(page.locator("body")).toContainText(formatCurrency(3000000));
    checkpoint("outstanding-reviewed",{invoice:oldInvoiceB.invoiceNumber,remaining:3000000,delivered:true});
    await page.goto(`/customer-purchase-orders?tab=approval&view=${orderB.id}`); await expect(page.locator("body")).toContainText(poNumber);
    await expect(page.locator("body")).toContainText(formatCurrency(1000000));
    const decision="UAT19: outstanding Rp3 juta ditinjau; setujui kredit 3 bulan sesuai kesepakatan pelanggan";
    await submit(page,page.getByRole("button",{name:"Approve",exact:true}),decision);
    const approved=await db.salesOrder.findUniqueOrThrow({where:{id:orderB.id},include:{invoice:{include:{collectionTasks:true}}}});
    expect(approved).toMatchObject({status:"Invoiced",approvalStatus:"Approved",approvalDecisionNote:decision,approvalDecidedById:users.MANAGER.id});
    expect(approved.invoice).toMatchObject({totalAmount:1000000,paidAmount:0,remainingAmount:1000000,status:"Unpaid",creditTermMonths:3});
    invoiceB=approved.invoice!; orderB=approved;
    expect(approved.invoice!.collectionTasks).toHaveLength(1); expect(approved.invoice!.collectionTasks[0]).toMatchObject({status:"Planned",scheduledDate:invoiceB.dueDate,customerId:customerB.id});
    const audits=await db.auditTrail.findMany({where:{entityId:orderB.id}}); expect(JSON.stringify(audits)).toContain(decision);
    checkpoint("approved-invoiced-credit-reminder",{order:approved,audits});
    await page.goto(`/customer-purchase-orders/${orderB.id}`); await expect(page.locator("body")).toContainText("Approved"); await shot(page,"manager-approved");
    await page.goto(`/collections?view=${approved.invoice!.collectionTasks[0].id}`);
    await expect(page.locator("body")).toContainText(invoiceB.invoiceNumber); await expect(page.locator("body")).toContainText("Planned"); await shot(page,"credit-reminder");
  });
  await runStep(page,20,"Manager","INV-B Rp1.000.000, tenor tiga bulan, DPP ditambah PPN sama dengan total",async()=>{
    await login(page,"MANAGER"); await page.goto(`/invoices?view=${invoiceB.id}`);
    const saved=await db.invoice.findUniqueOrThrow({where:{id:invoiceB.id}});
    expect(saved).toMatchObject({totalAmount:1000000,remainingAmount:1000000,paidAmount:0,ppnApplied:true,customerNpwpSnapshot:customerB.npwp,paymentTermType:"CREDIT",creditTermMonths:3,creditTermWeeks:null,customerPoNumberSnapshot:poNumber});
    const issueWib=new Date(saved.issueDate.getTime()+7*3600000);
    const expectedDue=new Date(Date.UTC(issueWib.getUTCFullYear(),issueWib.getUTCMonth()+3,issueWib.getUTCDate()));
    expect(toBusinessDateInputWib(saved.dueDate)).toBe(expectedDue.toISOString().slice(0,10));
    expect(saved.netSalesAmount+saved.ppnAmount).toBe(1000000); expect(saved.ppnRateBasisPoints).toBeGreaterThan(0);
    expect(saved.netSalesAmount).toBe(Math.round(1000000*10000/(10000+saved.ppnRateBasisPoints)));
    const items=parseInvoiceItemSnapshots(saved.itemsSnapshot); expect(items.map(item=>item.quantity).sort((a,b)=>a-b)).toEqual([3,4]);
    await expect(page.locator("body")).toContainText(formatCurrency(saved.netSalesAmount)); await expect(page.locator("body")).toContainText(formatCurrency(saved.ppnAmount));
    await expect(page.locator("body")).toContainText(formatDate(saved.dueDate)); await expect(page.locator("body")).toContainText("Credit – 3 Months");
    checkpoint("credit-tax-verified",{invoice:saved,items,expectedDueWib:expectedDue.toISOString().slice(0,10),sum:saved.netSalesAmount+saved.ppnAmount});
    await shot(page,"credit-invoice-tax"); await page.getByRole("link",{name:"Cetak Invoice",exact:true}).click();
    await expect(page.locator("article")).toContainText(formatInvoiceCurrency(saved.ppnAmount)); await expect(page.locator("article")).toContainText(poNumber);
    const printedNotes=await page.locator("article").innerText();
    if(saved.notes?.includes("UAT19: outstanding") && printedNotes.includes(saved.notes)) {
      finding({id:"AB-NOTE-01",severity:"P2",title:"Alasan approval Manager otomatis menjadi catatan invoice pelanggan",printedNotes:saved.notes,relatedExistingBug:"FLOW-A-01"});
    }
    await page.emulateMedia({media:"print"}); await page.pdf({path:`${out}/20-credit-invoice.pdf`,format:"A4",printBackground:true});
    await page.emulateMedia({media:"screen"}); await shot(page,"credit-invoice-print");
  });
  expect(steps.filter(step=>step.no>=15&&step.status==="failed").map(step=>`${step.no}: ${step.error}`)).toEqual([]);
  expect(steps.filter(step=>step.no>=15).flatMap(step=>step.findings)).toEqual([]);
});
