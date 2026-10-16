import { PrismaClient, type User, type Product, type Customer, type SalesOrderSource, type SalesOrderApprovalStatus, type Prisma } from "@prisma/client";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { buildInvoiceSnapshot } from "../src/lib/invoice-snapshot";
import { buildOrderTaxSnapshot } from "../src/lib/tax";
import { getDueDateForPaymentTerm } from "../src/lib/workflow";
import { formatCurrency, formatDate } from "../src/lib/format";
import { toBusinessDateInputWib } from "../src/lib/business-clock";
import { toJakartaDateTimeInputValue } from "../src/lib/delivery-note-status";

const db=new PrismaClient(),out=process.env.SIT_UMKM_OUTPUT_DIR||"outputs/uat-flow-cde-2026-10-16";
const password="UAT-CDE-Simulation-Only-123!",users:Record<string,User>={};
type Order=Prisma.SalesOrderGetPayload<{include:{customer:true;items:true;invoice:true;pickingList:true}}>;
type Line={product:Product;quantity:number;price:number};
type Finding={id:string;severity:string;title:string;[key:string]:unknown};
type Step={no:number;role:string;title:string;status:string;checkpoints:Record<string,unknown>[];findings:Finding[];error?:string;started:string;seconds?:number};
let current:Step;const steps:Step[]=[],runtimeErrors:string[]=[];
const group=(no:number)=>no<=33?"flow-c-continuation":no<=37?"flow-d":"flow-e";
function save(){const name=group(current?.no??31);writeFileSync(`${out}/${name}-evidence.json`,JSON.stringify({scope:"UAT steps 31-45",method:"Isolated fixtures; actual role login and UI mutations",steps:steps.filter(step=>group(step.no)===name),runtimeErrors},null,2));}
function checkpoint(name:string,data:Record<string,unknown>={}){current.checkpoints.push({name,...data});save();}
function finding(data:Finding){current.findings.push(data);save();}
async function shot(page:Page,name:string){const screenshot=`${out}/${current.no}-${name}.png`;await page.waitForLoadState("networkidle");await page.screenshot({path:screenshot,fullPage:true,caret:"initial"});checkpoint(name,{screenshot,url:page.url()});}
async function runStep(page:Page,no:number,role:string,title:string,action:()=>Promise<void>){
  current={no,role,title,status:"running",checkpoints:[],findings:[],started:new Date().toISOString()};steps.push(current);save();const start=Date.now();
  try{await action();current.status=current.findings.length?"passed_with_findings":"passed";}
  catch(error){current.status="failed";current.error=error instanceof Error?error.message:String(error);try{await shot(page,"failure");writeFileSync(`${out}/${no}-failure-body.txt`,await page.locator("body").innerText());}catch{/* original */}}
  finally{current.seconds=Math.round((Date.now()-start)/100)/10;save();}
  console.log(`Step ${no}: ${current.status} (${current.seconds}s) ${title}${current.error?`: ${current.error.slice(0,400)}`:""}`);
}
function finish(from:number,to:number){expect(steps.filter(s=>s.no>=from&&s.no<=to&&s.status==="failed").map(s=>`${s.no}: ${s.error}`)).toEqual([]);expect(steps.filter(s=>s.no>=from&&s.no<=to).flatMap(s=>s.findings)).toEqual([]);}
async function login(page:Page,role:string){await page.context().clearCookies();await page.goto("/login");await page.locator('input[name="username"]').fill(users[role].username);await page.locator('input[name="password"]').fill(password);await page.getByRole("button",{name:"Login",exact:true}).click();await expect(page).toHaveURL("http://127.0.0.1:3137/");await page.waitForLoadState("networkidle");}
async function submit(page:Page,trigger:Locator,note="Simulasi UAT langkah 31-45"){
  await page.waitForLoadState("networkidle");const sent=page.waitForResponse(r=>r.request().method()==="POST"&&Boolean(r.request().headers()["next-action"]),{timeout:60000});await trigger.click();
  const dialog=page.getByRole("dialog",{name:/^Confirm /});const mode=await Promise.race([dialog.waitFor({state:"visible",timeout:5000}).then(()=>"confirm").catch(()=>"none"),sent.then(()=>"sent")]);
  if(mode==="confirm"){await dialog.getByRole("textbox").fill(note);await dialog.getByRole("button",{name:"Submit",exact:true}).click();}expect((await sent).status()).toBeLessThan(400);await expect(dialog).toBeHidden();await page.waitForLoadState("networkidle");
}
function pdf(lines:string[]){const stream=`BT /F1 12 Tf 55 780 Td 18 TL ${lines.map((line,i)=>`${i?"T* ":""}(${line.replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)")}) Tj`).join("\n")} ET`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];let content="%PDF-1.4\n";const offsets=[0];for(const[i,object]of objects.entries()){offsets.push(Buffer.byteLength(content));content+=`${i+1} 0 obj\n${object}\nendobj\n`;}const xref=Buffer.byteLength(content);content+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(content);}
const digest=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
const revisedE4=pdf(["UAT REVISED CUSTOMER PO E4","PO-UAT-E4","Required: 2026-10-28","Produk A UAT: 2 x Rp100000","Total: Rp200000","Credit 2 Months"]);
let products:Product[],a:Customer,b:Customer,c:Customer,c1:Order,c2:Order,e2:Order,e4:Order,e5:Order,e7:Order,e8:Order,oldB:Order;
let cNoteId:string,e7NoteId:string,soD:Order,poD:Order,e1:Order;
let storage:ReturnType<typeof createClient>["storage"];
async function document(key:string){const bytes=pdf([`UAT CUSTOMER PO ${key}`,`PO-UAT-${key}`,"Required: 2026-10-23","Credit fixture; document for isolated UAT only"]),storedName=`customer-purchase-orders/fixture-${key.toLowerCase()}.pdf`;
  const upload=await storage.from(process.env.SUPABASE_CUSTOMER_PO_BUCKET!).upload(storedName,bytes,{contentType:"application/pdf",upsert:false});expect(upload.error).toBeNull();return{customerPoDocumentName:`po-${key.toLowerCase()}.pdf`,customerPoDocumentStoredName:storedName,customerPoDocumentMimeType:"application/pdf",customerPoDocumentSize:bytes.length,customerPoDocumentSha256:digest(bytes)};
}
async function seedOrder(key:string,customer:Customer,lines:Line[],options:{source?:SalesOrderSource;approval?:SalesOrderApprovalStatus;invoice?:boolean;months?:number;weeks?:number;overdue?:boolean;actor?:string}={}):Promise<Order>{
  const orderNumber=`SO-UAT-${key}`,existing=await db.salesOrder.findUnique({where:{orderNumber},include:{customer:true,items:true,invoice:true,pickingList:true}});if(existing)return existing;
  const invoice=options.invoice!==false,source=options.source??"DIRECT",approval=options.approval??"NotRequired",total=lines.reduce((sum,line)=>sum+line.quantity*line.price,0),months=options.weeks?null:options.months??1,weeks=options.weeks??null;
  const issue=options.overdue?new Date("2026-10-01T03:00:00Z"):new Date(),due=getDueDateForPaymentTerm({issueDate:issue,paymentTermType:"CREDIT",creditTermMonths:months,creditTermWeeks:weeks});
  const order=await db.salesOrder.create({data:{orderNumber,source,customerPoNumber:source==="CUSTOMER_PO"?`PO-UAT-${key}`:null,...(source==="CUSTOMER_PO"?await document(key):{}),requiredDate:source==="CUSTOMER_PO"?new Date("2026-10-23T00:00:00+07:00"):null,
    customerId:customer.id,createdByUserId:users[options.actor??"SALES"].id,orderDate:issue,status:approval==="Pending"?"Draft":invoice?"Invoiced":"Confirmed",approvalStatus:approval,approvalRisk:approval==="Pending"?"Outstanding Payment":null,
    subtotal:total,total,...buildOrderTaxSnapshot({totalAmount:total,customerNpwp:customer.npwp}),paymentTermType:"CREDIT",creditTermMonths:months,creditTermWeeks:weeks,deliveryDestinationSnapshot:customer.address},include:{customer:true,items:true,invoice:true,pickingList:true}});
  await db.salesOrderItem.createMany({data:lines.map(line=>({salesOrderId:order.id,productId:line.product.id,productSkuSnapshot:line.product.sku,itemName:line.product.productName,quantity:line.quantity,baseUnitPrice:line.price,finalUnitPrice:line.price,subtotal:line.quantity*line.price}))});
  order.items=await db.salesOrderItem.findMany({where:{salesOrderId:order.id}});
  if(invoice){order.invoice=await db.invoice.create({data:{invoiceNumber:`INV-UAT-${key}`,salesOrderId:order.id,customerId:customer.id,issueDate:issue,dueDate:due,totalAmount:total,remainingAmount:total,paidAmount:0,status:"Unpaid",...buildOrderTaxSnapshot({totalAmount:total,customerNpwp:customer.npwp}),...buildInvoiceSnapshot(order),paymentTermType:"CREDIT",creditTermMonths:months,creditTermWeeks:weeks}});
    await db.collectionTask.create({data:{customerId:customer.id,invoiceId:order.invoice.id,scheduledDate:due,status:"Planned",notes:`Credit payment collection reminder for ${order.invoice.invoiceNumber}`}});}
  return order;
}
async function seedPack(order:Order){const existing=await db.pickingList.findUnique({where:{salesOrderId:order.id}});if(existing)return existing;
  return db.pickingList.create({data:{pickingListNumber:`PL-${order.orderNumber}`,salesOrderId:order.id,status:"Packed",usesChecklist:true,pickerName:`PIC ${order.orderNumber}`,packerName:`PIC ${order.orderNumber}`,packedAt:new Date(),items:{create:order.items.map(item=>({salesOrderItemId:item.id,itemName:item.itemName,orderedQuantity:item.quantity,availableQuantity:item.quantity,packedQuantity:item.quantity,isChecked:true,availabilityStatus:"Available"}))}}});
}
test.beforeAll(async()=>{
  const schema=process.env.SIT_UMKM_SCHEMA;if(!schema||!/^sit_umkm_[a-f0-9_]+$/.test(schema))throw new Error("Isolated runner required");const[scope]=await db.$queryRaw<{schema:string}[]>`SELECT current_schema() AS schema`;expect(scope.schema).toBe(schema);
  for(const role of["ADMIN","SALES","MANAGER"]as const)users[role]=await db.user.upsert({where:{username:`uat_cde_${role.toLowerCase()}`},update:{},create:{username:`uat_cde_${role.toLowerCase()}`,displayName:`UAT CDE ${role}`,role,passwordHash:hashPassword(password)}});
  products=await Promise.all([70000,140000].map((cost,i)=>db.product.upsert({where:{sku:`UAT-CDE-${i+1}`},update:{},create:{sku:`UAT-CDE-${i+1}`,productName:`Produk ${i?"B":"A"} UAT`,listPrice:cost}})));
  async function customer(key:string){return await db.customer.findFirst({where:{companyName:`PT UAT CDE ${key}`}})??db.customer.create({data:{name:`Ibu UAT ${key}`,companyName:`PT UAT CDE ${key}`,phone:"081234567890",email:`cde-${key.toLowerCase()}@example.test`,address:`Jl. Simulasi CDE ${key} 16, Jakarta`,customerSegment:"Retail",portfolioOwnerUserId:users.SALES.id,npwp:key==="B"?"9000000000000002":null}});}
  a=await customer("A");b=await customer("B");c=await customer("C");
  const bucket=process.env.SUPABASE_CUSTOMER_PO_BUCKET!;expect(bucket).toBe(schema.replaceAll("_","-"));storage=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
  const lookup=await storage.getBucket(bucket);if(!lookup.data){const result=await storage.createBucket(bucket,{public:false,allowedMimeTypes:["application/pdf"],fileSizeLimit:8388608});expect(result.error).toBeNull();}
  const line=(quantity:number,price=100000,index=0):Line=>({product:products[index],quantity,price});
  c1=await seedOrder("C1",c,[line(1),line(1,200000,1)],{weeks:2,actor:"MANAGER"});c2=await seedOrder("C2",c,[line(2)],{source:"CUSTOMER_PO",weeks:2});
  await seedPack(c1);await seedPack(c2);
  for(const [key,order,status]of[["C1",c1,"ConvertedToSO"],["C2",c2,"ConvertedToCustomerPO"]]as const)await db.customerInquiry.upsert({where:{inquiryNumber:`INQ-UAT-${key}`},update:{},create:{inquiryNumber:`INQ-UAT-${key}`,customerId:c.id,status,salesOrderId:order.id,items:{create:order.items.map(item=>({productId:item.productId,itemName:item.itemName,productSkuSnapshot:item.productSkuSnapshot,quantity:item.quantity,agreedUnitPrice:item.finalUnitPrice}))}}});
  oldB=await seedOrder("B-OLD",b,[line(50)],{weeks:1,overdue:true});
  if(oldB.invoice!.paidAmount===0){await db.payment.create({data:{invoiceId:oldB.invoice!.id,paymentDate:new Date("2026-10-02T03:00:00Z"),amount:2000000,paymentMethod:"BankTransfer",notes:"Prasyarat historis B"}});oldB.invoice=await db.invoice.update({where:{id:oldB.invoice!.id},data:{paidAmount:2000000,remainingAmount:3000000,status:"Partial"}});}
  if(!await db.deliveryNote.findUnique({where:{deliveryNoteNumber:"SJ-UAT-B-OLD"}}))await db.deliveryNote.create({data:{deliveryNoteNumber:"SJ-UAT-B-OLD",salesOrderId:oldB.id,invoiceId:oldB.invoice!.id,customerId:b.id,status:"Delivered",deliveryDate:new Date("2026-10-02T00:00:00Z"),recipientName:b.name,recipientPhone:b.phone,recipientAddress:b.address,receivedAt:new Date("2026-10-02T05:00:00Z"),receiverName:"Penerima historis B",receivedBy:"Fixture UAT"}});
  e2=await seedOrder("E2",b,[line(4)],{invoice:false,approval:"Pending",months:1});e4=await seedOrder("E4",b,[line(2)],{source:"CUSTOMER_PO",invoice:false,approval:"Pending",months:2});
  e5=await seedOrder("E5",a,[line(3)],{invoice:false,weeks:2});e7=await seedOrder("E7",a,[line(10)],{actor:"MANAGER",months:1});e8=await seedOrder("E8",a,[line(6)],{actor:"MANAGER",weeks:1,overdue:true});
  const pick=await seedPack(e7);let note=await db.deliveryNote.findUnique({where:{deliveryNoteNumber:"SJ-UAT-E7"}});
  if(!note){note=await db.deliveryNote.create({data:{deliveryNoteNumber:"SJ-UAT-E7",salesOrderId:e7.id,invoiceId:e7.invoice!.id,pickingListId:pick.id,customerId:a.id,deliveryDate:new Date("2026-10-16T00:00:00Z"),status:"Draft",recipientName:a.name,recipientPhone:a.phone,recipientAddress:a.address,senderName:"Fixture UAT",driverName:"Budi Santoso",vehiclePlateNumber:"B 1234 TJK",sources:{create:{salesOrderId:e7.id,invoiceId:e7.invoice!.id,pickingListId:pick.id}}},include:{sources:true}});
    const source=await db.deliveryNoteSource.findFirstOrThrow({where:{deliveryNoteId:note.id}}),items=await db.pickingListItem.findMany({where:{pickingListId:pick.id}});
    await db.deliveryNoteItem.createMany({data:items.map(item=>({deliveryNoteId:note!.id,sourceId:source.id,pickingListItemId:item.id,itemName:item.itemName,productCode:products[0].sku,orderedQuantitySnapshot:10,packedQuantitySnapshot:10,quantity:10,outstandingQuantity:0,unit:"PCS"}))});}
  e7NoteId=note.id;writeFileSync(`${out}/po-e4-revised.pdf`,revisedE4);
});
test.afterAll(async()=>db.$disconnect());

async function audit(page:Page,id:string,reference:string,action:string,role:string,reason?:string){
  const entries=await db.auditTrail.findMany({where:{entityId:id,action},orderBy:{createdAt:"desc"}});expect(entries.length).toBeGreaterThan(0);expect(entries[0].actorUsername).toBe(users[role].username);if(reason)expect(JSON.stringify(entries)).toContain(reason);
  checkpoint("audit-verified",{reference,action,entries});await page.goto(`/audit-trail?q=${encodeURIComponent(reference)}&action=${action}`);
  const row=page.getByRole("row").filter({hasText:reference}).first();await expect(row).toContainText(users[role].username);
  if(reason){await row.getByRole("button",{name:"View audit record details",exact:true}).click();await expect(page.getByRole("dialog")).toContainText(reason);await shot(page,"audit-detail");await page.keyboard.press("Escape");}
}
async function pay(page:Page,role:string,invoiceId:string,amount:number,reference:string){await login(page,role);await page.goto(`/payments?invoiceId=${invoiceId}`);const form=page.locator("form#record-payment");await form.locator('select[name="invoiceId"]').selectOption(invoiceId);await form.locator('input[name="amount"]').fill(String(amount));await form.locator('input[name="paymentDate"]').fill(toBusinessDateInputWib(new Date()));await form.locator('input[name="notes"]').fill(reference);await submit(page,form.getByRole("button",{name:"Record Payment",exact:true}),reference);}
async function createOrder(page:Page,role:string,customer:Customer,key:string,quantity:number,months:number,po=false){
  await login(page,role);await page.goto(`/${po?"customer-purchase-orders":"sales-orders"}?mode=create`);const form=page.locator("form").filter({has:page.locator('input[name="items"]')});
  await form.locator('select[name="customerId"]').selectOption(customer.id);await form.getByRole("combobox",{name:"Product Name",exact:true}).first().selectOption(products[0].id);await form.getByRole("spinbutton",{name:"Qty",exact:true}).first().fill(String(quantity));await form.getByRole("spinbutton",{name:"Base Unit Price",exact:true}).first().fill("100000");
  await form.locator('select[name="paymentTermType"]').selectOption("CREDIT");await form.locator('select[name="creditTerm"]').selectOption(`${months}m`);await form.locator('input[name="notes"]').fill(`UAT-${key}`);
  if(po){await form.locator('input[name="customerPoNumber"]').fill(`PO-UAT-${key}`);await form.locator('input[name="requiredDate"]').fill("2026-10-24");await form.locator('input[name="customerPoDocument"]').setInputFiles({name:`po-${key}.pdf`,mimeType:"application/pdf",buffer:pdf([`UAT PO ${key}`,`PO-UAT-${key}`,`Produk A: ${quantity} x Rp100000`,`Credit ${months} Months`])});}
  await submit(page,form.getByRole("button",{name:po?"Create Customer PO":"Create Sales Order",exact:true}));return db.salesOrder.findFirstOrThrow({where:{customerId:customer.id,notes:{contains:`UAT-${key}`}},include:{customer:true,items:true,invoice:true,pickingList:true}});
}
function monthlyDue(issue:Date,months:number){const wib=new Date(issue.getTime()+7*3600000);return new Date(Date.UTC(wib.getUTCFullYear(),wib.getUTCMonth()+months,wib.getUTCDate())).toISOString().slice(0,10);}
async function creditInvoice(order:Order,total:number,months:number){const inv=await db.invoice.findUniqueOrThrow({where:{salesOrderId:order.id},include:{collectionTasks:true}});expect(inv).toMatchObject({totalAmount:total,paidAmount:0,remainingAmount:total,status:"Unpaid",paymentTermType:"CREDIT",creditTermMonths:months});expect(toBusinessDateInputWib(inv.dueDate)).toBe(monthlyDue(inv.issueDate,months));expect(inv.collectionTasks).toHaveLength(1);expect(inv.collectionTasks[0]).toMatchObject({status:"Planned",scheduledDate:inv.dueDate});checkpoint("invoice-credit-and-reminder",{invoice:inv});return inv;}
async function cancel(page:Page,role:string,invoiceId:string,reason:string){
  await login(page,role);await page.goto(`/invoices?view=${invoiceId}`);const form=page.locator("form").filter({has:page.locator('textarea[name="cancellationReason"]')});await form.locator('textarea[name="cancellationReason"]').fill(reason);await submit(page,form.getByRole("button",{name:"Cancel Invoice",exact:true}),reason);
  const inv=await db.invoice.findUniqueOrThrow({where:{id:invoiceId},include:{collectionTasks:true}});expect(inv).toMatchObject({status:"Cancelled",paidAmount:0,cancellationReason:reason,cancelledByUserId:users[role].id});expect(inv.collectionTasks.length).toBeGreaterThan(0);expect(inv.collectionTasks.every(task=>task.status==="Cancelled")).toBe(true);
  checkpoint("cancelled-and-reminders-cancelled",{invoice:inv});await page.goto(`/receivables?q=${inv.invoiceNumber}`);await expect(page.getByRole("row").filter({hasText:inv.invoiceNumber})).toHaveCount(0);await shot(page,"not-active-receivable");
  await page.goto(`/invoices?tab=done&view=${inv.id}`);await expect(page.locator("body")).toContainText("Cancelled");await audit(page,inv.id,inv.invoiceNumber,"CANCELLED",role,reason);return inv;
}

test("Alur C 31-33 gabungan SO PO inquiry Done dan pelunasan terpisah",async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,31,"Manager + Admin","Gabungkan dua Pick menjadi satu SJ terkunci dengan jumlah A3 B1 dan dua referensi invoice",async()=>{
    await login(page,"MANAGER");await page.goto("/surat-jalan?mode=create");
    const form=page.locator("form").filter({has:page.locator('input[name="itemSelectionMode"]')});await form.getByRole("combobox",{name:"Customer / delivery destination",exact:true}).selectOption({label:`${c.companyName} — ${c.address}`});
    const draftEditor=page.locator("form").filter({has:page.locator(`input[name="id"][value="${e7NoteId}"]`)});
    if(await draftEditor.count()){
      finding({id:"CDE-CREATE-01",severity:"P2",title:"Halaman Create Surat Jalan juga membuka editor Draft transaksi pelanggan lain",newCustomer:c.companyName,unrelatedDraft:"SJ-UAT-E7",unrelatedCustomer:a.companyName,assignmentFields:await page.locator('select[name="deliveryAssignmentId"]').count()});
      await shot(page,"create-and-unrelated-draft-editor");
    }
    await expect(form.getByRole("button",{name:"Select all ready items",exact:true})).toHaveCount(2);for(const button of await form.getByRole("button",{name:"Select all ready items",exact:true}).all())await button.click();
    await form.locator('select[name="deliveryAssignmentId"]').selectOption("budi-b1234");await form.locator('input[name="senderName"]').fill("Manager CDE UAT");await form.locator('input[name="authorizedBy"]').fill("Manager CDE UAT");await submit(page,form.getByRole("button",{name:"Create Draft Surat Jalan",exact:true}));
    const draft=await db.deliveryNote.findFirstOrThrow({where:{sources:{some:{salesOrderId:c1.id}}},include:{sources:true,items:true}});cNoteId=draft.id;
    expect(draft).toMatchObject({status:"Draft",salesOrderId:null,invoiceId:null,pickingListId:null});expect(draft.sources).toHaveLength(2);
    expect(new Set(draft.sources.map(source=>source.salesOrderId))).toEqual(new Set([c1.id,c2.id]));expect(new Set(draft.sources.map(source=>source.invoiceId))).toEqual(new Set([c1.invoice!.id,c2.invoice!.id]));
    const sums=Object.fromEntries(products.map(product=>[product.productName,draft.items.filter(item=>item.itemName===product.productName).reduce((sum,item)=>sum+item.quantity,0)]));expect(sums).toEqual({[products[0].productName]:3,[products[1].productName]:1});checkpoint("combined-draft-sources-and-totals",{note:draft,sums});
    await page.goto(`/surat-jalan?view=${draft.id}`);await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"Kirim Surat Jalan",exact:true}).click();await expect(page.getByRole("dialog",{name:"Kirim Surat Jalan?",exact:true})).toBeVisible();await submit(page,page.getByRole("button",{name:"Ya, Kirim & Kunci",exact:true}));
    const issued=await db.deliveryNote.findUniqueOrThrow({where:{id:draft.id},include:{items:true,sources:true}});expect(issued.status).toBe("Issued");await page.goto(`/surat-jalan?view=${draft.id}`);await expect(page.getByRole("button",{name:"Simpan Draft",exact:true})).toHaveCount(0);
    checkpoint("combined-issued-and-locked",{note:issued});await login(page,"ADMIN");await page.goto(`/surat-jalan?view=${draft.id}`);await page.getByRole("link",{name:"Cetak",exact:true}).first().click();
    const article=page.locator("article");for(const reference of[c1.orderNumber,c2.orderNumber,c2.customerPoNumber!,c1.invoice!.invoiceNumber,c2.invoice!.invoiceNumber])await expect(article).toContainText(reference);
    const visible=await article.locator("tbody tr").evaluateAll(rows=>rows.map(row=>({name:(row as HTMLTableRowElement).cells[3].textContent?.trim(),quantity:Number((row as HTMLTableRowElement).cells[4].textContent)})));expect(visible.filter(row=>row.name===products[0].productName).reduce((sum,row)=>sum+row.quantity,0)).toBe(3);expect(visible.filter(row=>row.name===products[1].productName).reduce((sum,row)=>sum+row.quantity,0)).toBe(1);
    await page.emulateMedia({media:"print"});await page.pdf({path:`${out}/31-combined-sj.pdf`,format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});await shot(page,"combined-sj-print");checkpoint("print-three-source-lines-aggregate-four-units",{rows:visible,sums});
    if(issued.items.every(item=>!item.productCode))finding({id:"CDE-SKU-01",severity:"P3",title:"SKU produk kosong juga pada Surat Jalan gabungan",relatedExistingBug:"AB-SKU-01"});
    const search=article.getByRole("searchbox",{name:"Search rows containing this text",exact:true});
    if(await search.count()){await search.fill(products[1].productName);await page.emulateMedia({media:"print"});const states=await article.locator("tbody tr").evaluateAll(rows=>rows.map(row=>({text:row.textContent,display:getComputedStyle(row).display})));
      if(states.filter(row=>row.display!=="none").length!==3)finding({id:"CDE-PRINT-01",severity:"P2",title:"Filter cetak menghilangkan barang pada SJ gabungan",relatedExistingBug:"FLOW-A-02",states});
      await page.pdf({path:`${out}/31-combined-filtered.pdf`,format:"A4",printBackground:true});await page.screenshot({path:`${out}/31-combined-filtered-print-media.png`,fullPage:true});await page.emulateMedia({media:"screen"});}
  });
  await runStep(page,32,"Manager","Penerimaan gabungan menyelesaikan kedua inquiry sementara invoice belum dibayar",async()=>{
    await login(page,"MANAGER");await page.goto(`/surat-jalan?view=${cNoteId}`);await page.waitForLoadState("networkidle");await page.getByRole("button",{name:"Tandai Sudah Diterima",exact:true}).first().click();const dialog=page.getByRole("dialog",{name:"Konfirmasi Barang Diterima",exact:true}),time=toJakartaDateTimeInputValue(new Date());
    await dialog.locator('input[name="receiverName"]').fill("Ibu Nia Penerima C UAT");await dialog.locator('input[name="receivedAt"]').fill(time);await dialog.locator('textarea[name="receiptNotes"]').fill("UAT32: bukti penerimaan gabungan Produk A3 dan Produk B1 lengkap");await submit(page,dialog.getByRole("button",{name:"Konfirmasi Diterima",exact:true}));
    const note=await db.deliveryNote.findUniqueOrThrow({where:{id:cNoteId}});expect(note).toMatchObject({status:"Delivered",receiverName:"Ibu Nia Penerima C UAT",receivedAt:new Date(`${time}+07:00`)});
    const inquiries=await db.customerInquiry.findMany({where:{salesOrderId:{in:[c1.id,c2.id]}}});expect(inquiries).toHaveLength(2);expect(inquiries.every(inquiry=>inquiry.status==="Done")).toBe(true);
    const invoices=await db.invoice.findMany({where:{id:{in:[c1.invoice!.id,c2.invoice!.id]}}});expect(invoices.map(invoice=>invoice.remainingAmount).sort()).toEqual([200000,300000]);expect(invoices.every(invoice=>invoice.status==="Unpaid"&&invoice.paidAmount===0)).toBe(true);
    checkpoint("received-both-inquiries-done-unpaid",{note,inquiries,invoices});for(const inquiry of inquiries){await page.goto(`/customer-inquiries/${inquiry.id}`);await expect(page.locator("body")).toContainText("Done");await shot(page,`done-${inquiry.inquiryNumber}`);}
  });
  await runStep(page,33,"Admin + Manager","Lunasi invoice gabungan satu per satu lalu reminder Done dan pelanggan C Clean",async()=>{
    await pay(page,"ADMIN",c1.invoice!.id,300000,"UAT33-TRF-C1 Admin Rp300.000");let first=await db.invoice.findUniqueOrThrow({where:{id:c1.invoice!.id},include:{collectionTasks:true}}),second=await db.invoice.findUniqueOrThrow({where:{id:c2.invoice!.id},include:{collectionTasks:true}});
    expect(first).toMatchObject({status:"Paid",remainingAmount:0,paidAmount:300000});expect(second).toMatchObject({status:"Unpaid",remainingAmount:200000,paidAmount:0});expect(first.collectionTasks.every(task=>task.status==="Done")).toBe(true);expect(second.collectionTasks.every(task=>task.status==="Planned")).toBe(true);checkpoint("first-paid-second-unchanged",{first,second});
    await pay(page,"MANAGER",c2.invoice!.id,200000,"UAT33-TRF-C2 Manager Rp200.000");first=await db.invoice.findUniqueOrThrow({where:{id:c1.invoice!.id},include:{collectionTasks:true}});second=await db.invoice.findUniqueOrThrow({where:{id:c2.invoice!.id},include:{collectionTasks:true}});
    expect(first).toMatchObject({status:"Paid",remainingAmount:0,paidAmount:300000});expect(second).toMatchObject({status:"Paid",remainingAmount:0,paidAmount:200000});expect([...first.collectionTasks,...second.collectionTasks].every(task=>task.status==="Done")).toBe(true);
    await page.goto(`/customers?view=${c.id}`);const detail=page.locator("section").filter({has:page.getByRole("heading",{name:c.companyName,exact:true})}).first();await expect(detail.getByText("Clean",{exact:true})).toBeVisible();await expect(detail.locator("article").filter({hasText:"Outstanding Payment"})).toContainText(formatCurrency(0));
    checkpoint("both-paid-reminders-done-customer-clean",{first,second});await shot(page,"customer-c-clean");
  });finish(31,33);
});

test("Alur D 34-37 disposable Draft delete Manager PO dan Admin cancel invoice",async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,34,"Sales","SO-D Rp100.000 menjadi Draft Pending karena outstanding lama pelanggan B",async()=>{
    soD=await createOrder(page,"SALES",b,"D34",1,1);expect(soD).toMatchObject({total:100000,status:"Draft",approvalStatus:"Pending",invoice:null,pickingList:null});expect(await db.deliveryNoteSource.count({where:{salesOrderId:soD.id}})).toBe(0);const old=await db.invoice.findUniqueOrThrow({where:{id:oldB.invoice!.id}});expect(old.remainingAmount).toBe(3000000);checkpoint("disposable-pending-draft",{order:soD,oldInvoice:old});await page.goto(`/sales-orders/${soD.id}`);await shot(page,"sales-draft-pending");
  });
  await runStep(page,35,"Admin","Hapus Draft tanpa dependensi dengan alasan dan audit tetap dapat ditemukan",async()=>{
    await login(page,"ADMIN");await page.goto(`/sales-orders/${soD.id}`);expect(await db.salesOrderItemRevision.count({where:{salesOrderId:soD.id}})).toBe(0);expect(await db.customerInquiry.count({where:{salesOrderId:soD.id}})).toBe(0);
    const reason="UAT35: pelanggan menarik pesanan sebelum invoice dan penyiapan barang";await submit(page,page.getByRole("button",{name:/^Delete Sales Order/}).first(),reason);expect(await db.salesOrder.findUnique({where:{id:soD.id}})).toBeNull();expect(await db.salesOrderItem.count({where:{salesOrderId:soD.id}})).toBe(0);
    const response=await page.goto(`/sales-orders/${soD.id}`);expect(response?.status()).toBe(404);await audit(page,soD.id,soD.orderNumber,"DELETED","ADMIN",reason);checkpoint("deleted-draft-no-longer-processable",{orderId:soD.id,reference:soD.orderNumber});
  });
  await runStep(page,36,"Manager","PO-D kredit dua bulan Rp200.000 langsung mempunyai invoice dan reminder",async()=>{
    poD=await createOrder(page,"MANAGER",a,"D36",2,2,true);expect(poD).toMatchObject({source:"CUSTOMER_PO",total:200000,status:"Invoiced",approvalStatus:"NotRequired"});await creditInvoice(poD,200000,2);checkpoint("manager-po-invoiced",{order:poD});await page.goto(`/invoices?view=${poD.invoice!.id}`);await shot(page,"po-d-invoice");
  });
  await runStep(page,37,"Admin","Batalkan invoice D Unpaid, keluarkan dari tagihan aktif dan batalkan reminder",async()=>{
    await cancel(page,"ADMIN",poD.invoice!.id,"UAT37: pelanggan menunda pesanan PO-D sebelum pembayaran");
  });finish(34,37);
});

test("Alur E 38-45 tindakan Manager invoice approval revisi metadata SJ dan pelunasan overdue",async({page})=>{
  page.on("pageerror",error=>{runtimeErrors.push(error.message);save();});
  await runStep(page,38,"Manager","SO-E1 Rp400.000 tanpa approval tambahan dengan invoice otomatis kredit satu bulan",async()=>{
    e1=await createOrder(page,"MANAGER",a,"E1-38",4,1);expect(e1).toMatchObject({total:400000,status:"Invoiced",approvalStatus:"NotRequired"});await creditInvoice(e1,400000,1);checkpoint("manager-direct-order-created",{order:e1});await audit(page,e1.id,e1.orderNumber,"CREATED","MANAGER");await shot(page,"manager-so-created-audit");
  });
  await runStep(page,39,"Manager","Approve SO-E2 dari Sales dan buat invoice Rp400.000 serta reminder satu bulan",async()=>{
    await login(page,"MANAGER");await page.goto(`/sales-orders?tab=approval&view=${e2.id}`);const reason="UAT39: outstanding lama pelanggan B ditinjau dan SO-E2 disetujui";await submit(page,page.getByRole("button",{name:"Approve",exact:true}),reason);
    e2=await db.salesOrder.findUniqueOrThrow({where:{id:e2.id},include:{customer:true,items:true,invoice:true,pickingList:true}});expect(e2).toMatchObject({status:"Invoiced",approvalStatus:"Approved",approvalDecisionNote:reason,approvalDecidedById:users.MANAGER.id});await creditInvoice(e2,400000,1);checkpoint("sales-order-approved",{order:e2});await audit(page,e2.id,e2.orderNumber,"APPROVED","MANAGER",reason);
  });
  await runStep(page,40,"Manager","Ubah A4 menjadi A5 pada SO Approved dan invoice yang sama menjadi Rp500.000",async()=>{
    await login(page,"MANAGER");const invoiceId=e2.invoice!.id;await page.goto(`/sales-orders/${e2.id}`);const editor=page.locator(`[data-order-item-editor="${e2.id}"]`);await editor.getByRole("button",{name:"Edit Barang",exact:true}).click();await editor.getByRole("spinbutton",{name:"Qty 1",exact:true}).fill("5");await editor.getByRole("button",{name:"Simpan Perubahan",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog).toContainText(formatCurrency(500000));
    const reason="UAT40: Manager menambah Produk A menjadi lima sebelum pembayaran dan Pack";await dialog.getByRole("textbox").fill(reason);await dialog.getByRole("button",{name:"Submit",exact:true}).click();await expect(editor).toContainText("Perubahan barang tersimpan");
    const saved=await db.salesOrder.findUniqueOrThrow({where:{id:e2.id},include:{customer:true,items:true,invoice:true,pickingList:true}});expect(saved).toMatchObject({approvalStatus:"Approved",status:"Invoiced",total:500000});expect(saved.items[0]).toMatchObject({quantity:5,finalUnitPrice:100000});expect(saved.invoice).toMatchObject({id:invoiceId,totalAmount:500000,remainingAmount:500000,paidAmount:0});e2=saved;checkpoint("same-approved-order-and-invoice-revised",{order:saved});await shot(page,"approved-quantity-revised");await audit(page,e2.id,e2.orderNumber,"ITEMS_REVISED","MANAGER",reason);
  });
  await runStep(page,41,"Manager","Revisi tanggal dan PDF PO-E4 tetap Draft Pending Rp200.000 kredit dua bulan",async()=>{
    await login(page,"MANAGER");await page.goto(`/customer-purchase-orders/${e4.id}`);const form=page.locator("form").filter({has:page.locator('input[name="requiredDate"]')});await form.locator('input[name="requiredDate"]').fill("2026-10-28");await form.locator('input[name="customerPoDocument"]').setInputFiles({name:"po-e4-revised.pdf",mimeType:"application/pdf",buffer:revisedE4});const reason="UAT41: Manager mencatat revisi tanggal kebutuhan dan PDF pelanggan";await form.locator('input[name="confirmationNote"]').fill(reason);await submit(page,form.getByRole("button",{name:"Save Draft Metadata",exact:true}),reason);
    const saved=await db.salesOrder.findUniqueOrThrow({where:{id:e4.id},include:{invoice:true}});expect(saved).toMatchObject({customerPoNumber:e4.customerPoNumber,customerId:e4.customerId,total:200000,creditTermMonths:2,approvalStatus:"Pending",status:"Draft",invoice:null,customerPoDocumentName:"po-e4-revised.pdf",customerPoDocumentSha256:digest(revisedE4)});expect(toBusinessDateInputWib(saved.requiredDate!)).toBe("2026-10-28");
    await page.goto(`/customer-purchase-orders/${e4.id}`);await expect(page.locator('input[name="requiredDate"]')).toHaveValue("2026-10-28");const[download]=await Promise.all([page.waitForEvent("download"),page.getByRole("link",{name:"Unduh Customer PO Document",exact:true}).click()]);const path=`${out}/41-downloaded-${download.suggestedFilename()}`;await download.saveAs(path);expect(readFileSync(path)).toEqual(revisedE4);checkpoint("manager-draft-metadata-and-pdf-revised",{order:saved,download:path});await shot(page,"po-e4-revised");await audit(page,e4.id,e4.customerPoNumber!,"DRAFT_UPDATED","MANAGER",reason);
  });
  await runStep(page,42,"Manager","Terbitkan invoice SO-E5 Rp300.000 kredit dua minggu tanpa PPN dan jadwalkan reminder",async()=>{
    await login(page,"MANAGER");await page.goto(`/sales-orders/${e5.id}`);await submit(page,page.getByRole("button",{name:"Generate Invoice",exact:true}).first());e5=await db.salesOrder.findUniqueOrThrow({where:{id:e5.id},include:{customer:true,items:true,invoice:true,pickingList:true}});expect(e5.status).toBe("Invoiced");
    const inv=await db.invoice.findUniqueOrThrow({where:{salesOrderId:e5.id},include:{collectionTasks:true}});expect(inv).toMatchObject({totalAmount:300000,paidAmount:0,remainingAmount:300000,status:"Unpaid",paymentTermType:"CREDIT",creditTermWeeks:2,creditTermMonths:null,ppnApplied:false,ppnAmount:0});expect(inv.dueDate.getTime()-inv.issueDate.getTime()).toBe(14*86400000);expect(inv.collectionTasks).toHaveLength(1);expect(inv.collectionTasks[0]).toMatchObject({status:"Planned",scheduledDate:inv.dueDate});checkpoint("manager-generated-two-week-invoice",{order:e5,invoice:inv});await page.goto(`/invoices?view=${inv.id}`);await expect(page.locator("body")).toContainText(formatDate(inv.dueDate));await shot(page,"manager-invoice-e5");await audit(page,inv.id,inv.invoiceNumber,"CREATED","MANAGER");
  });
  await runStep(page,43,"Manager","Batalkan invoice E5 dan reminder lalu pertahankan alasan dan aktor",async()=>{
    await cancel(page,"MANAGER",e5.invoice!.id,"UAT43: pelanggan menunda SO-E5 sebelum pembayaran");
  });
  await runStep(page,44,"Manager","Kurangi jumlah Draft SJ-E7 menjadi kirim delapan sisa dua tanpa mengubah invoice Rp1 juta",async()=>{
    await login(page,"MANAGER");await page.goto(`/surat-jalan?view=${e7NoteId}`);const original=await db.deliveryNote.findUniqueOrThrow({where:{id:e7NoteId},include:{items:true,sources:true}});const item=original.items[0];expect(item.quantity).toBe(10);const form=page.locator("form").filter({has:page.locator(`input[name="id"][value="${e7NoteId}"]`)});
    await form.locator(`input[name="quantity_${item.id}"]`).fill("8");await form.locator(`input[name="adjustmentNote_${item.id}"]`).fill("UAT44: dua unit ditunda oleh pelanggan");await form.locator('input[name="notes"]').fill("UAT44: kirim delapan unit, dua unit belum dikirim");const reason="UAT44: Manager menyesuaikan rencana pengiriman pada Draft";await form.locator('input[name="confirmationNote"]').fill(reason);await submit(page,form.getByRole("button",{name:"Simpan Draft",exact:true}),reason);
    const saved=await db.deliveryNote.findUniqueOrThrow({where:{id:e7NoteId},include:{items:true,sources:true}});expect(saved).toMatchObject({status:"Draft",salesOrderId:original.salesOrderId,invoiceId:original.invoiceId,notes:"UAT44: kirim delapan unit, dua unit belum dikirim"});expect(saved.items[0]).toMatchObject({quantity:8,outstandingQuantity:2,orderedQuantitySnapshot:10,adjustmentNote:"UAT44: dua unit ditunda oleh pelanggan"});expect(saved.sources.map(source=>source.salesOrderId)).toEqual(original.sources.map(source=>source.salesOrderId));const inv=await db.invoice.findUniqueOrThrow({where:{id:e7.invoice!.id}});expect(inv).toMatchObject({totalAmount:1000000,remainingAmount:1000000,paidAmount:0});
    checkpoint("draft-reduced-invoice-unchanged",{note:saved,invoice:inv});await page.goto(`/surat-jalan?view=${e7NoteId}`);await expect(page.locator(`input[name="quantity_${item.id}"]`)).toHaveValue("8");await shot(page,"draft-send-eight-outstanding-two");await audit(page,saved.id,saved.deliveryNoteNumber,"DRAFT_UPDATED","MANAGER",reason);
  });
  await runStep(page,45,"Manager","Lunasi invoice overdue Rp600.000 tutup reminder dan pertahankan semua saldo invoice lain",async()=>{
    await login(page,"MANAGER");await page.goto(`/receivables?q=${e8.invoice!.invoiceNumber}`);await expect(page.getByRole("row").filter({hasText:e8.invoice!.invoiceNumber})).toContainText("Overdue");await shot(page,"overdue-e8-before-payment");
    const select={id:true,totalAmount:true,paidAmount:true,remainingAmount:true,status:true}as const;
    const before=await db.invoice.findMany({where:{id:{not:e8.invoice!.id}},select,orderBy:{id:"asc"}});const reference="UAT45-TRF-E8 Manager pelunasan Rp600.000";await pay(page,"MANAGER",e8.invoice!.id,600000,reference);
    const paid=await db.invoice.findUniqueOrThrow({where:{id:e8.invoice!.id},include:{payments:true,collectionTasks:true}});expect(paid).toMatchObject({totalAmount:600000,paidAmount:600000,remainingAmount:0,status:"Paid"});expect(paid.payments).toHaveLength(1);expect(paid.collectionTasks.length).toBeGreaterThan(0);expect(paid.collectionTasks.every(task=>task.status==="Done")).toBe(true);
    const after=await db.invoice.findMany({where:{id:{not:e8.invoice!.id}},select,orderBy:{id:"asc"}});expect(after).toEqual(before);checkpoint("overdue-paid-reminders-done-other-invoices-unchanged",{invoice:paid,otherInvoicesBefore:before,otherInvoicesAfter:after});await page.goto(`/receivables?q=${paid.invoiceNumber}`);await expect(page.getByRole("row").filter({hasText:paid.invoiceNumber})).toHaveCount(0);await page.goto(`/payments?q=${paid.invoiceNumber}`);await expect(page.getByRole("row").filter({hasText:reference})).toHaveCount(1);await shot(page,"overdue-payment-history");await audit(page,paid.payments[0].id,paid.invoiceNumber,"PAYMENT_RECORDED","MANAGER",reference);
  });finish(38,45);
});

test("Diagnostic default tanggal pembayaran WIB",async({page})=>{
  await login(page,"MANAGER");await page.goto(`/payments?invoiceId=${e8.invoice!.id}`);await page.waitForLoadState("networkidle");
  const now=new Date(),expectedWib=toBusinessDateInputWib(now),actual=await page.locator('form#record-payment input[name="paymentDate"]').inputValue();
  const evidence={id:"CDE-DATE-01",severity:"P2",linkedSteps:[33,45],title:"Tanggal pembayaran default memakai hari UTC sehingga mundur sehari pada awal hari WIB",observedAtUtc:now.toISOString(),expectedWib,actual,timezone:await page.evaluate(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),reproduced:actual!==expectedWib,source:"src/app/payments/page.tsx -> src/lib/workflow.ts:207"};
  writeFileSync(`${out}/payment-date-diagnostic.json`,JSON.stringify(evidence,null,2));await page.screenshot({path:`${out}/payment-date-default.png`,fullPage:true,caret:"initial"});
  expect(actual).toBe(expectedWib);
});
