import { PrismaClient, type User, type Product, type Customer, type CustomerInquiry, type SalesOrder, type Invoice, type PickingList, type DeliveryNote } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot, parseInvoiceItemSnapshots } from "../src/lib/invoice-snapshot";
import { buildOrderTaxSnapshot } from "../src/lib/tax";
import { formatCurrency, formatInvoiceCurrency, formatDate } from "../src/lib/format";
import { toBusinessDateInputWib } from "../src/lib/business-clock";
import { toJakartaDateTimeInputValue } from "../src/lib/delivery-note-status";

const db = new PrismaClient(), out = process.env.SIT_UMKM_OUTPUT_DIR || "outputs/uat-flow-bc-2026-10-16";
const password = "UAT-BC-Simulation-Only-123!";
const users: Record<string, User> = {};
let productsB: Product[], productsC: Product[], customerB: Customer, customerC: Customer;
let orderB: SalesOrder, invoiceB: Invoice, oldInvoiceB: Invoice, pickB: PickingList, noteB: DeliveryNote;
let inquiryC1: CustomerInquiry, inquiryC2: CustomerInquiry, orderC1: SalesOrder, orderC2: SalesOrder, invoiceC1: Invoice, invoiceC2: Invoice;
const requiredDate = "2026-10-25";
type Finding = { id: string; severity: string; title: string; [key: string]: unknown };
type Step = { no: number; role: string; title: string; status: string; checkpoints: Record<string, unknown>[]; findings: Finding[]; error?: string; started: string; seconds?: number };
let current: Step;
const steps: Step[] = [], runtimeErrors: string[] = [];
function save() {
  writeFileSync(`${out}/${current?.no <= 26 ? "flow-b-continuation" : "flow-c"}-evidence.json`, JSON.stringify({
    scope: "UAT steps 21-30", method: "Isolated database and Storage; role login and actual UI mutations",
    prerequisites: "Equivalent end-of-step-20 Approved PO-B/invoice Rp1m and historical Delivered outstanding Rp3m are seeded. Two agreed C inquiries are seeded. Other scenario actions use the UI.",
    steps, runtimeErrors }, null, 2));
}
function checkpoint(name: string, data: Record<string, unknown> = {}) { current.checkpoints.push({ name, ...data }); save(); }
function finding(data: Finding) { current.findings.push(data); save(); }
async function shot(page: Page, name: string) {
  const screenshot = `${out}/${current.no}-${name}.png`; await page.screenshot({path:screenshot,fullPage:true}); checkpoint(name,{screenshot,url:page.url()});
}
async function runStep(page: Page, no: number, role: string, title: string, action:()=>Promise<void>) {
  current={no,role,title,status:"running",checkpoints:[],findings:[],started:new Date().toISOString()}; steps.push(current); save(); const start=Date.now();
  try { await action(); current.status=current.findings.length ? "passed_with_findings" : "passed"; }
  catch(error) { current.status="failed"; current.error=error instanceof Error ? error.message : String(error);
    try { await shot(page,"failure"); writeFileSync(`${out}/${no}-failure-body.txt`,await page.locator("body").innerText()); } catch { /* preserve original */ }
  } finally { current.seconds=Math.round((Date.now()-start)/100)/10; save(); }
  console.log(`Step ${no}: ${current.status} (${current.seconds}s) ${title}${current.error ? `: ${current.error.slice(0,400)}` : ""}`);
}
async function login(page: Page, role: string) {
  await page.context().clearCookies(); await page.goto("/login");
  await page.locator('input[name="username"]').fill(users[role].username); await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:"Login",exact:true}).click(); await expect(page).toHaveURL("http://127.0.0.1:3137/"); await page.waitForLoadState("networkidle");
}
async function submit(page: Page, trigger: Locator, note="Simulasi UAT langkah 21-30") {
  await page.waitForLoadState("networkidle");
  const sent=page.waitForResponse(r=>r.request().method()==="POST"&&Boolean(r.request().headers()["next-action"]),{timeout:60000});
  await trigger.click(); const dialog=page.getByRole("dialog",{name:/^Confirm /});
  const mode=await Promise.race([dialog.waitFor({state:"visible",timeout:5000}).then(()=>"confirm").catch(()=>"none"),sent.then(()=>"sent")]);
  if(mode==="confirm") {await dialog.getByRole("textbox").fill(note);await dialog.getByRole("button",{name:"Submit",exact:true}).click();}
  expect((await sent).status()).toBeLessThan(400);await expect(dialog).toBeHidden();await page.waitForLoadState("networkidle");
}
function pdf(lines:string[]) {
  const stream=`BT /F1 12 Tf 55 780 Td 18 TL ${lines.map((line,i)=>`${i?"T* ":""}(${line.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)")}) Tj`).join("\n")} ET`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let content="%PDF-1.4\n";const offsets=[0];
  for(const [i,object] of objects.entries()){offsets.push(Buffer.byteLength(content));content+=`${i+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(content);content+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(content);
}
const cPdf=pdf(["UAT - CUSTOMER C INQUIRY C2",`Required date: ${requiredDate}`,"Katun C: 2 x Rp50000","Poliester C: 1 x Rp100000","Total: Rp200000","Credit 2 Weeks; PO number assigned automatically by seller"]);

test.beforeAll(async()=>{
  const schema=process.env.SIT_UMKM_SCHEMA;
  if(!schema||!/^sit_umkm_[a-f0-9_]+$/.test(schema))throw new Error("Isolated runner required");
  const [scope]=await db.$queryRaw<{schema:string}[]>`SELECT current_schema() AS schema`;expect(scope.schema).toBe(schema);
  for(const role of ["ADMIN","SALES","MANAGER"] as const)users[role]=await db.user.upsert({where:{username:`uat_bc_${role.toLowerCase()}`},update:{},create:{username:`uat_bc_${role.toLowerCase()}`,displayName:`UAT BC ${role}`,role,passwordHash:hashPassword(password)}});
  productsB=await Promise.all([70000,140000].map((cost,i)=>db.product.upsert({where:{sku:`UAT-BC-B-${i+1}`},update:{},create:{sku:`UAT-BC-B-${i+1}`,productName:`Produk ${i?"B":"A"} UAT`,listPrice:cost}})));
  productsC=await Promise.all([30000,40000].map((cost,i)=>db.product.upsert({where:{sku:`UAT-BC-C-${i+1}`},update:{},create:{sku:`UAT-BC-C-${i+1}`,productName:i?"Poliester C UAT":"Katun C UAT",listPrice:cost}})));
  async function customer(key:string){return await db.customer.findFirst({where:{companyName:`PT UAT BC Pelanggan ${key}`}})??db.customer.create({data:{name:`Ibu UAT ${key}`,companyName:`PT UAT BC Pelanggan ${key}`,phone:"081234567890",email:`bc-${key.toLowerCase()}@example.test`,address:`Jl. Simulasi BC ${key} 16, Jakarta`,customerSegment:"Retail",npwp:key==="B"?"9000000000000002":null,portfolioOwnerUserId:users.SALES.id}});}
  customerB=await customer("B");customerC=await customer("C");
  let b=await db.salesOrder.findUnique({where:{orderNumber:"SO-UAT-B-CONT"},include:{customer:true,items:true,invoice:true}});
  if(!b){
    const bytes=pdf(["UAT PREREQUISITE PO-B","PO-UAT-B-CONT","Produk A: 4 x Rp100000","Produk B: 3 x Rp200000","Total: Rp1000000","Credit 3 Months"]);
    const bucket=process.env.SUPABASE_CUSTOMER_PO_BUCKET!;expect(bucket).toBe(schema.replaceAll("_","-"));
    const storage=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
    const lookup=await storage.getBucket(bucket);if(!lookup.data){const created=await storage.createBucket(bucket,{public:false,allowedMimeTypes:["application/pdf"],fileSizeLimit:8388608});expect(created.error).toBeNull();}
    const storedName="customer-purchase-orders/uat-prerequisite-b.pdf";
    const upload=await storage.from(bucket).upload(storedName,bytes,{contentType:"application/pdf",upsert:false});expect(upload.error).toBeNull();
    b=await db.salesOrder.create({data:{orderNumber:"SO-UAT-B-CONT",customerPoNumber:"PO-UAT-B-CONT",source:"CUSTOMER_PO",customerId:customerB.id,createdByUserId:users.SALES.id,
      orderDate:new Date("2026-10-16T00:00:00+07:00"),requiredDate:new Date("2026-10-25T00:00:00+07:00"),status:"Invoiced",approvalStatus:"Approved",approvalRisk:"Outstanding Payment",
      approvalDecisionNote:"Prasyarat: Manager menyetujui PO-B setelah meninjau outstanding",approvalDecidedById:users.MANAGER.id,approvalDecidedAt:new Date(),
      total:1000000,subtotal:1000000,...buildOrderTaxSnapshot({totalAmount:1000000,customerNpwp:customerB.npwp}),paymentTermType:"CREDIT",creditTermMonths:3,
      deliveryDestinationSnapshot:customerB.address,customerPoDocumentName:"po-b-continuation.pdf",customerPoDocumentStoredName:storedName,customerPoDocumentMimeType:"application/pdf",customerPoDocumentSize:bytes.length,customerPoDocumentSha256:createHash("sha256").update(bytes).digest("hex"),
      items:{create:productsB.map((product,i)=>({productId:product.id,productSkuSnapshot:product.sku,itemName:product.productName,quantity:i?3:4,baseUnitPrice:i?200000:100000,finalUnitPrice:i?200000:100000,subtotal:i?600000:400000}))}
    },include:{customer:true,items:true,invoice:true}});
    b.invoice=await db.invoice.create({data:{invoiceNumber:"INV-UAT-B-CONT",salesOrderId:b.id,customerId:customerB.id,issueDate:new Date("2026-10-16T00:00:00+07:00"),dueDate:new Date("2027-01-16T00:00:00+07:00"),
      totalAmount:1000000,remainingAmount:1000000,paidAmount:0,status:"Unpaid",...buildOrderTaxSnapshot({totalAmount:1000000,customerNpwp:customerB.npwp}),...buildInvoiceSnapshot(b),paymentTermType:"CREDIT",creditTermMonths:3}});
    await db.collectionTask.create({data:{customerId:customerB.id,invoiceId:b.invoice.id,scheduledDate:b.invoice.dueDate,status:"Planned",notes:"Credit payment collection reminder for INV-UAT-B-CONT"}});
  }
  orderB=b;invoiceB=b.invoice!;
  let old=await db.salesOrder.findUnique({where:{orderNumber:"SO-UAT-B-HIST"},include:{customer:true,items:true,invoice:true}});
  if(!old){
    old=await db.salesOrder.create({data:{orderNumber:"SO-UAT-B-HIST",customerId:customerB.id,createdByUserId:users.SALES.id,status:"Shipped",orderDate:new Date("2026-10-01T03:00:00Z"),paymentTermType:"CREDIT",creditTermWeeks:1,
      total:5000000,subtotal:5000000,...buildOrderTaxSnapshot({totalAmount:5000000,customerNpwp:customerB.npwp}),deliveryDestinationSnapshot:customerB.address,
      items:{create:{productId:productsB[0].id,itemName:productsB[0].productName,quantity:100,baseUnitPrice:50000,finalUnitPrice:50000,subtotal:5000000}}},include:{customer:true,items:true,invoice:true}});
    old.invoice=await db.invoice.create({data:{invoiceNumber:"INV-UAT-B-HIST",salesOrderId:old.id,customerId:customerB.id,issueDate:new Date("2026-10-01T03:00:00Z"),dueDate:new Date("2026-10-08T03:00:00Z"),totalAmount:5000000,paidAmount:2000000,remainingAmount:3000000,status:"Partial",paymentTermType:"CREDIT",creditTermWeeks:1,...buildOrderTaxSnapshot({totalAmount:5000000,customerNpwp:customerB.npwp}),...buildInvoiceSnapshot(old)}});
    await db.payment.create({data:{invoiceId:old.invoice.id,paymentDate:new Date("2026-10-02T03:00:00Z"),amount:2000000,paymentMethod:"BankTransfer",notes:"Prasyarat invoice lama B"}});
    await db.deliveryNote.create({data:{deliveryNoteNumber:"SJ-UAT-B-HIST",salesOrderId:old.id,invoiceId:old.invoice.id,customerId:customerB.id,status:"Delivered",deliveryDate:new Date("2026-10-02T00:00:00Z"),recipientName:customerB.name,recipientPhone:customerB.phone,recipientAddress:customerB.address,receivedAt:new Date("2026-10-02T05:00:00Z"),receiverName:"Penerima historis UAT",receivedBy:"Fixture UAT"}});
  }oldInvoiceB=old.invoice!;
  for(const [key,quantities] of [["C1",[2,2]],["C2",[2,1]]] as const){
    const inquiry=await db.customerInquiry.upsert({where:{inquiryNumber:`INQ-UAT-${key}`},update:{},create:{inquiryNumber:`INQ-UAT-${key}`,customerId:customerC.id,neededBy:new Date(`${requiredDate}T00:00:00+07:00`),notes:`Kesepakatan inquiry ${key} UAT`,items:{create:productsC.map((product,i)=>({productId:product.id,productSkuSnapshot:product.sku,itemName:product.productName,quantity:quantities[i],requestedUnitPrice:i?105000:55000,agreedUnitPrice:i?100000:50000}))}}});
    if(key==="C1")inquiryC1=inquiry;else inquiryC2=inquiry;
  }
  writeFileSync(`${out}/customer-c2-po.pdf`,cPdf);
});
test.afterAll(async()=>db.$disconnect());

async function completePick(page:Page,order:SalesOrder,pic:string){
  await page.goto("/pick-pack?mode=create");const form=page.locator("form").filter({has:page.locator('select[name="salesOrderId"]')});
  await form.locator('select[name="salesOrderId"]').selectOption(order.id);await form.locator('input[name="pickerName"]').fill(pic);
  await submit(page,form.getByRole("button",{name:"Create Picking List",exact:true}));
  const pick=await db.pickingList.findUniqueOrThrow({where:{salesOrderId:order.id}});await page.goto(`/pick-pack?view=${pick.id}`);
  await submit(page,page.getByRole("button",{name:"Lanjut ke Pack",exact:true}));await page.goto(`/pick-pack?view=${pick.id}`);
  await expect(page.getByRole("button",{name:"Selesaikan Pick & Pack",exact:true})).toBeDisabled();
  for(const check of await page.locator('input[name="checkedItemId"]').all())await check.check();
  await submit(page,page.getByRole("button",{name:"Selesaikan Pick & Pack",exact:true}));
  const saved=await db.pickingList.findUniqueOrThrow({where:{id:pick.id},include:{items:true}});
  expect(saved).toMatchObject({status:"Packed",pickerName:pic,packedAt:expect.any(Date)});expect(saved.items.every(item=>item.isChecked&&item.packedQuantity===item.orderedQuantity)).toBe(true);
  const source=await db.salesOrderItem.findMany({where:{salesOrderId:order.id}});
  expect(saved.items.map(item=>`${item.itemName}:${item.orderedQuantity}`).sort()).toEqual(source.map(item=>`${item.itemName}:${item.quantity}`).sort());
  checkpoint("pick-completed",{order:order.orderNumber,pickingList:saved});return saved;
}
async function payment(page:Page,role:string,amount:number,reference:string){
  await login(page,role);await page.goto(`/payments?invoiceId=${invoiceB.id}`);const form=page.locator("form#record-payment");
  await form.locator('select[name="invoiceId"]').selectOption(invoiceB.id);await form.locator('input[name="amount"]').fill(String(amount));
  await form.locator('input[name="paymentDate"]').fill(toBusinessDateInputWib(new Date()));await form.locator('select[name="paymentMethod"]').selectOption("BankTransfer");
  await form.locator('input[name="notes"]').fill(reference);await submit(page,form.getByRole("button",{name:"Record Payment",exact:true}),reference);
}

test("Alur B 21-26 revisi approved invoice kredit pengiriman outstanding dan pelunasan",async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,21,"Manager","Revisi A5 B3 pada PO Approved menyelaraskan invoice yang sama ke Rp1.100.000",async()=>{
    await login(page,"MANAGER");expect(await db.payment.count({where:{invoiceId:invoiceB.id}})).toBe(0);expect(await db.pickingList.count({where:{salesOrderId:orderB.id}})).toBe(0);
    const originalInvoiceId=invoiceB.id,originalDue=invoiceB.dueDate;
    await page.goto(`/customer-purchase-orders/${orderB.id}`);const editor=page.locator(`[data-order-item-editor="${orderB.id}"]`);
    await expect(editor.getByRole("button",{name:"Edit Barang",exact:true})).toBeEnabled();await editor.getByRole("button",{name:"Edit Barang",exact:true}).click();
    const aIndex=(await editor.getByRole("combobox").nth(0).inputValue())===productsB[0].id?0:1;
    await editor.getByRole("spinbutton",{name:`Qty ${aIndex+1}`,exact:true}).fill("5");await editor.getByRole("button",{name:"Simpan Perubahan",exact:true}).click();
    const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog).toContainText(formatCurrency(1100000));
    const reason="UAT21: Manager menambah Produk A 4 menjadi 5 sebelum pembayaran dan Pack";await dialog.getByRole("textbox").fill(reason);await shot(page,"approved-revision-confirmation");
    await dialog.getByRole("button",{name:"Submit",exact:true}).click();await expect(editor).toContainText("Perubahan barang tersimpan");
    const saved=await db.salesOrder.findUniqueOrThrow({where:{id:orderB.id},include:{items:true,invoice:true}});
    expect(saved).toMatchObject({status:"Invoiced",approvalStatus:"Approved",total:1100000});expect(saved.invoice).toMatchObject({id:originalInvoiceId,totalAmount:1100000,remainingAmount:1100000,paidAmount:0,dueDate:originalDue});
    expect(saved.items.map(item=>item.quantity).sort()).toEqual([3,5]);expect(saved.invoice!.netSalesAmount+saved.invoice!.ppnAmount).toBe(1100000);
    const audits=await db.auditTrail.findMany({where:{entityId:orderB.id}});expect(JSON.stringify(audits)).toContain(reason);
    orderB=saved;invoiceB=saved.invoice!;checkpoint("same-approved-order-invoice-revised",{order:saved,audits});await shot(page,"approved-revision-saved");
  });
  await runStep(page,22,"Manager","Catatan kredit dan salinan invoice Rp1.100.000 dengan PPN tenor dan sisa yang benar",async()=>{
    await login(page,"MANAGER");await page.goto(`/invoices?view=${invoiceB.id}`);
    const business="UAT: Kredit 3 bulan, pembayaran paling lambat pada tanggal jatuh tempo invoice.";
    const internal="UAT22-INTERNAL: Manager memeriksa ketentuan kredit sebelum salinan dikirim";
    const form=page.locator("form").filter({has:page.locator('textarea[name="notes"]')});await form.locator('textarea[name="notes"]').fill(business);
    await submit(page,form.getByRole("button",{name:"Save Notes",exact:true}),internal);invoiceB=await db.invoice.findUniqueOrThrow({where:{id:invoiceB.id}});expect(invoiceB.notes).toContain(business);
    await page.goto(`/invoices?view=${invoiceB.id}`);await page.getByRole("link",{name:"Cetak Invoice",exact:true}).click();const article=page.locator("article");
    for(const value of [orderB.customerPoNumber!,formatInvoiceCurrency(1100000),formatInvoiceCurrency(invoiceB.netSalesAmount),formatInvoiceCurrency(invoiceB.ppnAmount),formatDate(invoiceB.dueDate),business])await expect(article).toContainText(value);
    await expect(article.getByRole("row").filter({hasText:productsB[0].productName})).toContainText("5");
    if((await article.innerText()).includes(internal))finding({id:"BC-NOTE-01",severity:"P2",title:"Catatan konfirmasi internal ikut tercetak pada invoice kredit",relatedExistingBug:"FLOW-A-01",enteredBusiness:business,printed:invoiceB.notes});
    checkpoint("invoice-credit-copy",{invoice:invoiceB});await page.emulateMedia({media:"print"});await page.pdf({path:`${out}/22-invoice-b.pdf`,format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});await shot(page,"credit-copy");
  });
  await runStep(page,23,"Manager","Pick PO kredit A5 B3 lengkap PIC lalu Pack Completed dan cetak tanpa harga",async()=>{
    await login(page,"MANAGER");pickB=await completePick(page,orderB,"PIC B UAT Manager");
    await page.goto(`/pick-pack?tab=completed&view=${pickB.id}`);await page.getByRole("link",{name:"Print Pick & Pack",exact:true}).click();
    const article=page.locator("article");await expect(article).toContainText("Completed");await expect(article).toContainText("PIC B UAT Manager");await expect(article).not.toContainText(/Rp|Price|Subtotal/);
    await page.emulateMedia({media:"print"});await page.pdf({path:`${out}/23-pick-b.pdf`,format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});await shot(page,"completed-pick-print");
  });
  await runStep(page,24,"Manager + Admin","Kredit belum dibayar tetap bisa dibuat Draft SJ dikirim terkunci dan dicetak Admin",async()=>{
    await login(page,"MANAGER");await page.goto(`/surat-jalan?mode=create&pickingListId=${pickB.id}`);
    const form=page.locator("form").filter({has:page.locator('select[name="deliveryAssignmentId"]')});await form.getByRole("combobox",{name:"Customer / delivery destination",exact:true}).selectOption({label:`${customerB.companyName} — ${customerB.address}`});
    for(const button of await form.getByRole("button",{name:"Select all ready items",exact:true}).all())await button.click();
    await form.locator('select[name="deliveryAssignmentId"]').selectOption("budi-b1234");await form.locator('input[name="senderName"]').fill("Manager BC UAT");
    await submit(page,form.getByRole("button",{name:"Create Draft Surat Jalan",exact:true}));
    noteB=await db.deliveryNote.findFirstOrThrow({where:{OR:[{salesOrderId:orderB.id},{sources:{some:{salesOrderId:orderB.id}}}]}});
    await page.goto(`/surat-jalan?view=${noteB.id}`);await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"Kirim Surat Jalan",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Kirim Surat Jalan?",exact:true})).toBeVisible();await submit(page,page.getByRole("button",{name:"Ya, Kirim & Kunci",exact:true}));
    const issued=await db.deliveryNote.findUniqueOrThrow({where:{id:noteB.id},include:{items:true}});expect(issued.status).toBe("Issued");expect(issued.items.map(item=>item.quantity).sort()).toEqual([3,5]);
    await page.goto(`/surat-jalan?view=${noteB.id}`);await expect(page.getByRole("button",{name:"Simpan Draft",exact:true})).toHaveCount(0);
    const balance=await db.invoice.findUniqueOrThrow({where:{id:invoiceB.id}});expect(balance).toMatchObject({remainingAmount:1100000,paidAmount:0,status:"Unpaid"});
    checkpoint("credit-shipped-with-balance",{note:issued,invoice:balance});
    await login(page,"ADMIN");await page.goto(`/surat-jalan?view=${noteB.id}`);await page.getByRole("link",{name:"Cetak",exact:true}).first().click();
    const article=page.locator("article");for(const value of [orderB.orderNumber,orderB.customerPoNumber!,invoiceB.invoiceNumber])await expect(article).toContainText(value);
    await expect(article).not.toContainText(/Rp|Unit Price/);await shot(page,"admin-sj-credit-copy");
    if(issued.items.every(item=>!item.productCode))finding({id:"BC-SKU-01",severity:"P3",title:"SKU sumber kembali tidak diteruskan ke Surat Jalan PO",relatedExistingBug:"AB-SKU-01",expected:productsB.map(p=>p.sku),actual:issued.items.map(i=>i.productCode)});
    await page.emulateMedia({media:"print"});await page.pdf({path:`${out}/24-sj-b.pdf`,format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});
  });
  await runStep(page,25,"Manager","Diterima membuat outstanding gabungan Rp4.100.000 dan dua invoice dapat ditelusuri",async()=>{
    await login(page,"MANAGER");await page.goto(`/surat-jalan?view=${noteB.id}`);await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"Tandai Sudah Diterima",exact:true}).first().click();
    const dialog=page.getByRole("dialog",{name:"Konfirmasi Barang Diterima",exact:true}),time=toJakartaDateTimeInputValue(new Date());
    await dialog.locator('input[name="receiverName"]').fill("Bapak Rudi Penerima B UAT");await dialog.locator('input[name="receivedAt"]').fill(time);await dialog.locator('textarea[name="receiptNotes"]').fill("UAT25: bukti diterima lengkap A5 B3 dalam kondisi baik");
    await submit(page,dialog.getByRole("button",{name:"Konfirmasi Diterima",exact:true}));
    const delivered=await db.deliveryNote.findUniqueOrThrow({where:{id:noteB.id}});expect(delivered).toMatchObject({status:"Delivered",receiverName:"Bapak Rudi Penerima B UAT",receivedAt:new Date(`${time}+07:00`)});
    await page.goto(`/customers?view=${customerB.id}`);await expect(page.locator("body")).toContainText(formatCurrency(4100000));
    const outstanding=page.locator("section").filter({has:page.getByRole("heading",{name:"Outstanding Invoices",exact:true})}).last();
    for(const inv of [invoiceB,oldInvoiceB]){
      await expect(outstanding.getByRole("link",{name:inv.invoiceNumber,exact:true})).toBeVisible();
      await outstanding.getByRole("link",{name:inv.invoiceNumber,exact:true}).click();await expect(page.locator("body")).toContainText(formatCurrency(inv.id===invoiceB.id?1100000:3000000));
      await page.goto(`/customers?view=${customerB.id}`);
    }
    checkpoint("delivered-outstanding-and-links",{note:delivered,outstanding:4100000,balances:[{invoice:invoiceB.invoiceNumber,remaining:1100000},{invoice:oldInvoiceB.invoiceNumber,remaining:3000000}]});await shot(page,"combined-outstanding");
  });
  await runStep(page,26,"Manager + Admin + Sales","Cicilan Rp400.000 pelunasan Rp700.000 menutup reminder dan invoice lama tetap Rp3 juta",async()=>{
    await payment(page,"MANAGER",400000,"UAT-BC-TRF-001 Manager cicilan Rp400.000");
    let saved=await db.invoice.findUniqueOrThrow({where:{id:invoiceB.id},include:{collectionTasks:true}});expect(saved).toMatchObject({paidAmount:400000,remainingAmount:700000,status:"Partial"});expect(saved.collectionTasks.every(task=>task.status==="Planned")).toBe(true);checkpoint("partial-and-reminder-still-planned",{invoice:saved});
    await payment(page,"ADMIN",700000,"UAT-BC-TRF-002 Admin pelunasan Rp700.000");
    saved=await db.invoice.findUniqueOrThrow({where:{id:invoiceB.id},include:{collectionTasks:true}});expect(saved).toMatchObject({paidAmount:1100000,remainingAmount:0,status:"Paid"});expect(saved.collectionTasks.length).toBeGreaterThan(0);expect(saved.collectionTasks.every(task=>task.status==="Done")).toBe(true);
    const payments=await db.payment.findMany({where:{invoiceId:invoiceB.id}});expect(payments.map(payment=>payment.amount).sort((a,b)=>a-b)).toEqual([400000,700000]);
    const old=await db.invoice.findUniqueOrThrow({where:{id:oldInvoiceB.id},include:{payments:true}});expect(old).toMatchObject({totalAmount:5000000,paidAmount:2000000,remainingAmount:3000000});expect(old.payments).toHaveLength(1);
    checkpoint("settled-reminders-closed-old-invoice-independent",{invoice:saved,payments,oldInvoice:old});
    await login(page,"SALES");await page.goto(`/payments?q=${invoiceB.invoiceNumber}`);
    for(const reference of ["UAT-BC-TRF-001","UAT-BC-TRF-002"])await expect(page.getByRole("row").filter({hasText:reference})).toHaveCount(1);await shot(page,"sales-two-payments");
    await page.goto(`/invoices?tab=done&view=${invoiceB.id}`);await expect(page.locator("body")).toContainText("Paid");await shot(page,"paid-zero");
    await page.goto(`/customers?view=${customerB.id}`);await expect(page.locator("body")).toContainText(formatCurrency(3000000));
    const section=page.locator("section").filter({has:page.getByRole("heading",{name:"Outstanding Invoices",exact:true})}).last();await expect(section.getByRole("link",{name:invoiceB.invoiceNumber,exact:true})).toHaveCount(0);await expect(section.getByRole("link",{name:old.invoiceNumber,exact:true})).toBeVisible();
    for(const task of saved.collectionTasks){await page.goto(`/collections?tab=done&view=${task.id}`);await expect(page.locator("body")).toContainText("Done");await expect(page.locator("body")).toContainText(invoiceB.invoiceNumber);await shot(page,"reminder-done");}
  });
  expect(steps.filter(step=>step.no<=26&&step.status==="failed").map(step=>`${step.no}: ${step.error}`)).toEqual([]);
  expect(steps.filter(step=>step.no<=26).flatMap(step=>step.findings)).toEqual([]);
});

test("Alur C 27-30 inquiry ke SO dan PO dua invoice Credit 2 Weeks dan dua Pack Completed",async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,27,"Manager","Inquiry C1 menjadi Converted to SO Rp300.000 dengan invoice otomatis Credit 2 Weeks",async()=>{
    await login(page,"MANAGER");await page.goto(`/customer-inquiries/${inquiryC1.id}`);await page.getByRole("link",{name:"Convert to Sales Order",exact:true}).click();
    const form=page.locator("form").filter({has:page.locator('input[name="items"]')});await expect(form.locator('select[name="customerId"]')).toHaveValue(customerC.id);
    const payload=JSON.parse(await form.locator('input[name="items"]').inputValue());expect(payload.map((item:{quantity:number;baseUnitPrice:number})=>`${item.quantity}:${item.baseUnitPrice}`).sort()).toEqual(["2:100000","2:50000"]);
    await form.locator('select[name="paymentTermType"]').selectOption("CREDIT");await form.locator('select[name="creditTerm"]').selectOption("2w");
    await submit(page,form.getByRole("button",{name:"Create Sales Order",exact:true}));
    const converted=await db.customerInquiry.findUniqueOrThrow({where:{id:inquiryC1.id},include:{salesOrder:{include:{items:true,invoice:true}}}});const saved=converted.salesOrder!;orderC1=saved;invoiceC1=saved.invoice!;
    expect(converted.status).toBe("ConvertedToSO");expect(saved).toMatchObject({source:"DIRECT",total:300000,status:"Invoiced",approvalStatus:"NotRequired",paymentTermType:"CREDIT",creditTermWeeks:2,creditTermMonths:null});expect(saved.invoice).toMatchObject({totalAmount:300000,remainingAmount:300000,status:"Unpaid",ppnApplied:false});
    expect(saved.items.map(item=>`${item.productId}:${item.quantity}:${item.finalUnitPrice}`).sort()).toEqual(productsC.map((p,i)=>`${p.id}:2:${i?100000:50000}`).sort());
    checkpoint("manager-inquiry-converted-invoiced",{inquiry:converted,order:saved});await page.goto(`/customer-inquiries/${inquiryC1.id}`);await expect(page.locator("body")).toContainText("Converted to SO");await shot(page,"inquiry-c1-converted");
  });
  await runStep(page,28,"Sales","Inquiry C2 pelanggan Clean menjadi PO Rp200.000 nomor otomatis Confirmed tanpa invoice",async()=>{
    await login(page,"SALES");await page.goto(`/customers?view=${customerC.id}`);await expect(page.locator("body")).toContainText("Clean");checkpoint("clean-before-po-conversion",{customer:customerC.id,unpaidInvoiceNotYetDelivered:invoiceC1?.invoiceNumber});
    await page.goto(`/customer-inquiries/${inquiryC2.id}`);await page.getByRole("link",{name:"Convert to Customer PO",exact:true}).click();
    const form=page.locator("form").filter({has:page.locator('input[name="items"]')});await expect(form.locator('input[name="customerPoNumber"]')).toHaveValue("");
    await form.locator('input[name="requiredDate"]').fill(requiredDate);await form.locator('input[name="customerPoDocument"]').setInputFiles({name:"customer-c2-po.pdf",mimeType:"application/pdf",buffer:cPdf});
    await form.locator('select[name="paymentTermType"]').selectOption("CREDIT");await form.locator('select[name="creditTerm"]').selectOption("2w");
    await submit(page,form.getByRole("button",{name:"Create Customer PO",exact:true}));
    const converted=await db.customerInquiry.findUniqueOrThrow({where:{id:inquiryC2.id},include:{salesOrder:{include:{items:true,invoice:true}}}});const saved=converted.salesOrder!;orderC2=saved;
    expect(converted.status).toBe("ConvertedToCustomerPO");expect(saved).toMatchObject({source:"CUSTOMER_PO",total:200000,status:"Confirmed",approvalStatus:"NotRequired",paymentTermType:"CREDIT",creditTermWeeks:2,creditTermMonths:null,invoice:null,customerPoDocumentName:"customer-c2-po.pdf"});
    expect(saved.customerPoNumber).toMatch(/^PO-\d{4}-\d{3,}$/);expect(toBusinessDateInputWib(saved.requiredDate!)).toBe(requiredDate);expect(saved.customerPoDocumentSha256).toBe(createHash("sha256").update(cPdf).digest("hex"));
    expect(saved.items.map(item=>`${item.productId}:${item.quantity}:${item.finalUnitPrice}`).sort()).toEqual(productsC.map((p,i)=>`${p.id}:${i?1:2}:${i?100000:50000}`).sort());
    checkpoint("sales-inquiry-converted-confirmed-po",{inquiry:converted,order:saved});await page.goto(`/customer-inquiries/${inquiryC2.id}`);await expect(page.locator("body")).toContainText("Converted to Customer PO");await shot(page,"inquiry-c2-converted");
  });
  await runStep(page,29,"Admin","Terbitkan invoice PO-C dan verifikasi dua tagihan Unpaid dua minggu tanpa PPN",async()=>{
    await login(page,"ADMIN");await page.goto(`/customer-purchase-orders/${orderC2.id}`);await submit(page,page.getByRole("button",{name:"Generate Invoice",exact:true}).first());
    invoiceC2=await db.invoice.findUniqueOrThrow({where:{salesOrderId:orderC2.id}});
    for(const [invoice,expected] of [[invoiceC1,300000],[invoiceC2,200000]] as const){
      const saved=await db.invoice.findUniqueOrThrow({where:{id:invoice.id}});expect(saved).toMatchObject({totalAmount:expected,remainingAmount:expected,paidAmount:0,status:"Unpaid",paymentTermType:"CREDIT",creditTermWeeks:2,creditTermMonths:null,ppnApplied:false,ppnAmount:0,netSalesAmount:expected});
      expect(saved.dueDate.getTime()-saved.issueDate.getTime()).toBe(14*86400000);expect(parseInvoiceItemSnapshots(saved.itemsSnapshot)).toHaveLength(2);
      await page.goto(`/invoices?view=${saved.id}`);await expect(page.locator("body")).toContainText(formatDate(saved.dueDate));await expect(page.locator("body")).toContainText(formatCurrency(expected));
      checkpoint("two-week-invoice-verified",{invoice:saved,dueDays:14});await shot(page,`invoice-${expected}`);
    }
    expect(await db.invoice.count({where:{salesOrderId:{in:[orderC1.id,orderC2.id]}}})).toBe(2);
  });
  await runStep(page,30,"Admin","Dua order C masing-masing melalui Pick dan Pack Completed serta siap digabung",async()=>{
    await login(page,"ADMIN");const picks=[];
    for(const [order,pic] of [[orderC1,"PIC C1 UAT"],[orderC2,"PIC C2 UAT"]] as const){
      const pick=await completePick(page,order,pic);picks.push(pick);await page.goto(`/pick-pack?tab=completed&view=${pick.id}`);await expect(page.getByRole("link",{name:"Create Surat Jalan",exact:true})).toBeVisible();await shot(page,`completed-${order.source}`);
    }
    expect(picks).toHaveLength(2);await page.goto("/surat-jalan?mode=create");
    await page.getByRole("combobox",{name:"Customer / delivery destination",exact:true}).selectOption({label:`${customerC.companyName} — ${customerC.address}`});
    await expect(page.locator("body")).toContainText(orderC1.orderNumber);await expect(page.locator("body")).toContainText(orderC2.orderNumber);
    await expect(page.getByRole("button",{name:"Select all ready items",exact:true})).toHaveCount(2);
    expect(await db.deliveryNoteSource.count({where:{salesOrderId:{in:[orderC1.id,orderC2.id]}}})).toBe(0);
    checkpoint("two-completed-sheets-ready-for-combined-delivery",{picks,orderIds:[orderC1.id,orderC2.id],combinedDeliveryNotCreated:true});await shot(page,"two-orders-ready-to-combine");
  });
  expect(steps.filter(step=>step.no>=27&&step.status==="failed").map(step=>`${step.no}: ${step.error}`)).toEqual([]);
  expect(steps.filter(step=>step.no>=27).flatMap(step=>step.findings)).toEqual([]);
});
