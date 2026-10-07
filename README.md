# CV Tajuk Revenue Cycle Information System

This is a thesis project for demonstrating the revenue cycle flow at CV Tajuk. It covers customer inquiries, customer and product data, Sales Orders, Customer Purchase Orders (PO), invoices, payments, Surat Jalan, receivables, collection reminders, dashboard insight, and testing evidence.

The app can be run locally for thesis demonstration and can also be deployed to Vercel with Supabase PostgreSQL for online demo or limited company-side pilot review.

The second iteration reduces duplicate manual input by making Sales Order the order-processing starting point. A confirmed sales order generates a connected invoice, then payment, Surat Jalan, receivable, collection, and dashboard views reuse the same Sales Order and Invoice data.

Sales Order also records the selected payment terms. Immediate Payment invoices are due on the issue date; Credit invoices use the selected credit term. Both can proceed through picking and Surat Jalan before full payment.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL on Supabase
- Supabase Storage
- Vitest

## Install Dependencies

```bash
npm install
```

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd` for the same commands.

## Setup Database

Create a local environment file:

```bash
cp .env.example .env
```

Fill `.env` with Supabase values:

```bash
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
AUTH_SECRET="replace-with-a-long-random-secret"
SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="replace-with-your-server-only-service-role-key"
SUPABASE_CUSTOMER_PO_BUCKET="pre-order-documents"
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Do not expose it in browser code or commit it to Git.

Generate Prisma client and apply the included PostgreSQL migration:

```bash
npm run prisma:generate
npm run prisma:deploy
```

For future schema changes during development, create a new migration with `npm run prisma:migrate -- --name change_name`.

## Seed Database

```bash
npm run prisma:seed
```

This now previews the small UMKM demo dataset without accessing or changing the database. It includes 15 customers, 10 textile products, 22 direct Sales Orders, 8 Customer POs, and 24 invoices across six months. To validate or replace the configured database, follow [the demo dataset runbook](docs/DEMO_DATASET_RUNBOOK.md). Replacement requires an explicit target and creates a verified application-data and PO-attachment backup first.

If the deployed Supabase database already has business data but is missing demo login accounts, use the safer user-only seed:

```bash
npm run prisma:seed:users
```

This upserts only the Admin, Sales, and Manager demo users and does not delete existing business records.

## Cloud Storage

Customer PO documents are stored in the private Supabase Storage bucket configured by `SUPABASE_CUSTOMER_PO_BUCKET`.
The app creates the bucket on first upload if it does not already exist.
The sample bucket value remains `pre-order-documents` so existing deployments can read previously uploaded files; the application code and environment variable use Customer PO naming.

## Run Locally

```bash
npm run dev
```

Open the local URL shown in the terminal, normally `http://localhost:3000`.

For a non-developer Windows user, open PowerShell in the project folder, then run:

```powershell
cd "C:\path\to\cv-tajuk-revenue-cycle-system"
npm.cmd run dev
```

If port 3000 is already in use, open `http://localhost:3000` first because the app may already be running. Otherwise, run `npm.cmd run dev -- --port 3001` and open `http://localhost:3001`.

## Production Cost Guidance

The existing product price input is **Production Cost / Unit**, excluding PPN.
Only Admin can enter or change this cost. Its stored Prisma field remains
`listPrice` for compatibility with existing order and inquiry defaults.
Every actual cost change creates an attributed history entry in the same
transaction; editing names, notes, or status does not create a cost change.

Products, Sales Orders, and Customer POs display **Average Production Cost - Last
30 Days** in their existing layouts. This is the average unit cost weighted by
the time each cost was in effect, not by sales quantity or number of edits:
`sum(unit cost × duration) / duration with known cost history`. The last cost
before the window carries forward; future entries are excluded. Partial history
shows its actual coverage, and missing history is unavailable. Display dates use
WIB. This is a production cost reference over time, not inventory valuation or
a quantity-weighted cost of units manufactured.

The migration records existing product costs starting at migration time without
inventing earlier history. Apply it with `npm run prisma:deploy`; do not reset or
reseed an existing database. The demo seed supplies explicit sample history.
SO/PO price comparisons exclude PPN and calculate the percentage relative to
cost. They remain advisory and do not alter entered prices, totals, or historical
order/invoice snapshots.

## Run Tests

```bash
npm run test
```

## Deploy to Vercel

Deployment uses:

```text
GitHub repository -> Vercel web app -> Supabase PostgreSQL database
```

In Vercel, add the required environment variables in:

```text
Project -> Settings -> Environment Variables
```

Required keys:

```text
DATABASE_URL
DIRECT_URL
AUTH_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_CUSTOMER_PO_BUCKET
```

Use a Supabase database connection string beginning with `postgresql://` for `DATABASE_URL` and `DIRECT_URL`. Do not use the Supabase project URL beginning with `https://` for Prisma database access.

The build command is handled by `npm run build`, which runs `prisma generate && next build` so Prisma Client exists before the Next.js production build.

See `docs/DEPLOYMENT_GUIDE.md` for the full Vercel and Supabase deployment checklist.

## Thesis Demo Guide

### Demo Login

The app uses simple demo login accounts for thesis demonstration.

Default accounts:

- Admin: `admin` / `Admin123!`
- Sales: `sales` / `Sales123!`
- Manager: `manager` / `Manager123!`

This login is not production security. It is only used so the thesis demo can show a basic access screen before the main system.

### How to Run the App Locally

```bash
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Open the local URL shown in the terminal, usually `http://127.0.0.1:3000`.

If PowerShell blocks `npm`, use `npm.cmd` for the same commands.

### Release Verification

Before a deployment or thesis demonstration release, run:

```bash
npx tsc --noEmit
npm run lint
npm test -- --maxWorkers=1 --minWorkers=1
npm run prisma:deploy
npm run build
npm start
```

The integration suite uses the configured Supabase database and rolls its fixture transactions back. Database replacement is excluded from routine release verification; the default `npm run prisma:seed` only previews the dataset.

### How to Reset Demo Data

```bash
npm run demo:validate -- --target YOUR_PROJECT_REF
npm run demo:replace -- --target YOUR_PROJECT_REF --python PATH_TO_REPORTLAB_PYTHON
```

The replacement command archives existing application rows and private PO attachments, tests restore and replacement in an isolated schema, then replaces business records in one transaction. Existing ordinary accounts, credentials, schema, RLS, and migration history are preserved. Identified SIT fixture accounts are removed. Do not run it against a database containing business records that should remain active.

The reset supplies fictional textile customers with and without NPWP, on-time and late payers, customers without payment history, PPN and non-PPN snapshots, current cost history, picking, combined Surat Jalan, receivables, collection, and pending manager approvals. Financial totals and application queries are verified before replacement. See the runbook for backups, prerequisites, and repeatable demo scenarios.

### How to Add Another Account

1. Log in with the default Admin account.
2. Open Settings.
3. Fill username, display name, password, role, and status.
4. Select Save Account.

Roles control operational actions in this system. Sales can create Sales Orders, Customer Purchase Orders, and Customer Inquiries; Admin manages invoices, payments, and delivery; Manager can use all operational actions and approve Sales-created orders for customers with outstanding payments.

### Recommended Demo Flow

1. Open Dashboard and explain the management summary.
2. Start from Login and enter the default Admin username and password.
3. Open Customers and add a new customer.
4. Open Sales Orders and create an order with item name, quantity, and final unit price.
5. Choose Payment Terms: Immediate Payment or Credit. If Credit is selected, choose 1 to 4 weeks or 1 to 12 months.
6. Save the Sales Order, then use Admin or Manager access to generate the invoice when the order is eligible.
7. Open Invoices, show the generated invoice detail, then select View / Print Invoice.
8. Show the printable invoice layout with Bill To, item table, total, amount in words, payment terms, due date, payment status, and signature area.
9. Open Payments, select Record Payment from the invoice queue, and record a partial payment.
10. Open Pick & Pack, create and verify a Picking List, mark it Prepared, then continue to the separate Surat Jalan module.
11. Select View / Print to show the printable Surat Jalan document with recipient, item table, attention notes, and signature lines.
12. Open Receivables and show the remaining balance derived from the invoice.
13. Select Create Collection Task from the receivable row and save a planned reminder.
14. Return to Dashboard and show the updated totals, payment-term counts, Surat Jalan count, and collection reminder.

### How to Run Tests

```bash
npm run lint
npm run test
npm run build
```

### System Limitations

This is a thesis project. It now supports local demo usage and Vercel/Supabase deployment, but it does not include production-grade authentication, full page-level access isolation, payment gateway integration, bank integration, ERP integration, inventory management, stock movement, courier tracking, warehouse management, accounting journals, general ledger, or automated external API integration.

## Manual Demo Flow

1. Open the app and log in with the default Admin account.
2. Open Customers and select Add Customer.
3. Open Customer Inquiries, select Add Inquiry, choose the customer, and add requested item data.
4. Convert the inquiry to Sales Order for a normal order or Customer PO when the customer has a PO.
5. Complete order or PO details, choose Immediate Payment or Credit payment terms, and save. For Customer PO, optionally enter a unique Customer PO Number (up to 120 characters); leave it blank to generate one automatically. The Sales Order Number is always generated automatically.
6. If Sales created the order for a customer with outstanding payments, use Manager access to review it in Need Approval. Review the Customer PO document when applicable, then approve it or provide a required reason to reject it.
7. Use Admin or Manager access to generate the invoice from an eligible order for a Clean customer. Manager approval generates the invoice automatically for an order requiring approval.
8. Open Invoices and select View / Print Invoice to show the printable invoice output.
9. Open Payments and use the invoice queue to record a partial or full payment.
10. Open Pick & Pack, complete a Picking List, create a Draft Surat Jalan, adjust final delivery quantities, then Issue & Lock it.
11. After Issue, open the printable Surat Jalan; only the locked final items and quantities are shown.
12. Open Receivables and confirm only invoices with remaining balances appear.
13. Select Create Collection Task from a receivable row and save the planned reminder.
14. Return to Dashboard and confirm totals, payment-term counts, Surat Jalan count, receivables, recent orders, and collection updates.

## Main Modules

- Dashboard
- Customers
- Products
- Customer Inquiries
- Sales Orders
- Customer Purchase Orders
- Invoices
- Payments
- Pick & Pack
- Surat Jalan
- Receivables
- Collections
- Customer Outreach
- Settings

## System Scope Limitation

This project is intentionally limited to the scope of a thesis project and controlled internal demo/pilot. It does not include payment gateway integration, bank integration, ERP features, full accounting journals, general ledger, inventory management, e-commerce checkout, advanced authentication, complex page-level role isolation, AI features, or automated external API dependencies.

## Pick & Pack and Surat Jalan

Fulfillment is split into two modules:

- **Pick & Pack** at `/pick-pack`: **Active** contains eligible SO/Customer PO orders and unfinished sheets. **Completed** keeps every finished sheet, including delivery-linked and historical records.
- **Surat Jalan** at `/surat-jalan`: create Drafts from completed sheets, issue/lock them, and record delivery receipt. Cancelled documents remain in their labelled archive.

Admin and Manager manage sheets and deliveries; Sales can review them. Orders require Confirmed/Invoiced status, Approved/NotRequired approval, and an active invoice. Immediate Payment and Credit invoices need not be fully paid before preparation or shipment.

1. Create a Picking List with one required **PIC Pick & Pack**. Order/customer/item references and ordered quantities are copied without prices.
2. **Pick** displays the item list and quantities without editable quantities or checkboxes. Select **Lanjut ke Pack**.
3. **Pack** has a **Sudah diperiksa** checkbox per item, the same PIC, and optional internal notes. **Save Progress** preserves partial checks.
4. **Selesaikan Pick & Pack** requires a PIC and every item checked. No Available/Packed counts, availability status, package count or shortage notes are completion inputs. The sheet becomes read-only in **Completed**.
5. **Completed** supports search, one PIC filter, completion dates and Surat Jalan status. Admin/Manager can **Reopen** with a reason while no Surat Jalan exists; all checks reset for another review.
6. Select **Create Surat Jalan** and choose items from one or more completed sheets for the same customer/destination. Checklist sheets use ordered quantities as their initial ready-to-ship quantities. Historical completed lists retain their originally packed quantities and both original PIC records in detail/print.
7. The Draft snapshots every included source line. Selected lines use the chosen delivery quantity; unselected lines start at zero. Final quantities can be adjusted from zero up to the ready-to-ship snapshot while Draft. Outstanding delivery remains ordered minus final send.
8. **Issue & Lock** locks the document. Only positive final quantities print. Issued documents can become Delivered or Cancelled.

Print is available for both new and historical sheets. Checklist printing uses one PIC signature; Pick prints only item/ordered data, while Pack and Completed include recorded checks. Historical printing keeps its original quantity and personnel records.

Migration `20261004100000_add_pick_pack_checklist` adds checklist persistence. Migration `20261005010000_transition_active_pick_pack_checklists` transitions only unlinked unfinished legacy sheets, resets checks, and preserves the previous state in Audit Trail. Completed sheets and delivery snapshots are not rewritten.

This version supports one Picking List and at most one Surat Jalan per source order. A Surat Jalan may combine several source orders for the same customer/destination. Outstanding delivery is informational and does not create follow-up shipments. Stock balances, reservations, rack locations and carrier integration remain outside scope.

Migration `20260917215722_add_pick_pack_availability` renames the legacy picked quantity to available quantity, adds an explicit availability status, safely resets unstarted legacy lists, preserves active/completed history, and enforces quantity/status consistency at the database boundary.

## Second Iteration Connected Flow

The intended demonstration flow is:

Customer Inquiry -> Sales Order / Customer PO -> Invoice -> Payment -> Picking & Packing -> Surat Jalan -> Receivables -> Collections -> Dashboard

Customer inquiry flow:

Customer Inquiry (Open) -> Close or Cancel, or -> Convert to Sales Order / Customer PO -> Surat Jalan Delivered -> Done

Conversion is available only when every inquiry item has a matched product and agreed unit price. A Customer PO has its own Customer PO Number and requires a supporting customer PO document.

Immediate Payment flow:

Sales Order -> Invoice -> Picking & Packing -> Surat Jalan -> Receivables -> Payment

Credit flow:

Sales Order -> Invoice -> Picking & Packing -> Surat Jalan -> Receivables -> Collections -> Payment

Important rules:

- One sales order can only have one invoice.
- Every Customer PO is stored as a Sales Order with order source `CUSTOMER_PO`, a separate Customer PO Number, required date, and PO document metadata.
- Direct Sales Orders and Customer POs share the same outstanding-balance approval rule: an order entered by Sales for a customer with outstanding payments remains Pending until a Manager decides it.
- Pending and rejected orders cannot generate invoices. Manager approval atomically claims the pending decision and generates the invoice; rejection requires a reason and cancels the order.
- Invoice data comes from the sales order and customer.
- Immediate Payment invoices use immediate due date.
- Credit invoices use the selected credit term, from 1 to 4 weeks or 1 to 12 months. Weekly terms add 7 days per week; monthly terms use calendar months.
- Payments update the invoice paid amount, remaining amount, and status.
- Immediate Payment and Credit orders can start picking with an active invoice before full payment. Surat Jalan requires completed packing. Payment recording remains independent of delivery.
- Receivables are not manually entered; they come from invoices with remaining balance.
- Collection tasks can be started from a receivable row so customer and invoice data are preselected.
- Invoice and payment links open the warehouse module; a Packed Picking List is required before Surat Jalan can be issued.
- Invoice and Surat Jalan documents show the Customer PO Number when the linked order source is a Customer PO.

## Canonical Naming and Compatibility Routes

SO and Customer PO detail pages support **Edit Barang** in the existing item table. Users can change products/quantities and add/remove rows, review the resulting total, and provide a required reason. Saving updates the same invoice and Pending Pick sheet atomically and records immutable revision history. Item editing closes after any payment, entering Pack (including after Reopen), or creating any Surat Jalan. Sales can edit their own pre-invoice orders; invoiced orders require Admin/Manager, and invoiced Approved orders require Manager. Revised documents show a revision badge, including the printable invoice. See [the item editor flow and verification](docs/ORDER_ITEM_EDIT_STAGE3.md).

- Customer Purchase Orders use `SalesOrder.source = CUSTOMER_PO` and the canonical route `/customer-purchase-orders`; `/pre-orders` remains a redirect for old bookmarks.
- Collections use `CollectionTask` and `/collections`; `/billing` remains a redirect.
- Customer Outreach uses `CustomerOutreach` and `/customer-outreach`; `/follow-ups` remains a redirect.
- The canonical customer PO document API is `/api/customer-purchase-orders/[salesOrderId]/document`; the former `/api/pre-orders/...` endpoint delegates to it for compatibility.
- Payment terms are `IMMEDIATE` or `CREDIT`. Payment methods remain Cash, Bank Transfer, or Other.
- Audit records use `recordReference`, which can contain an order number, invoice number, company name, product name, or username.

## Current Base Structure

The current system includes database-backed pages, shared layout, Prisma schema, seed script, testing documentation, unit tests, and a clickable revenue cycle demo flow.


## Customer payment status

Customer Records displays **Outstanding Payment** only when a non-cancelled invoice has a positive remaining balance and at least one related Surat Jalan is **Delivered**. Otherwise the customer is **Clean**. Invoice creation or an Issued Surat Jalan alone does not activate outstanding. Eligible balances include amounts not yet due; partial payment reduces them, and settlement or invoice cancellation removes them.

Customer detail shows the outstanding amount, open invoice count, and links to the outstanding invoices. Customer Segment and Active/Inactive are retained. Purchase-frequency categories and their recommended markups have been removed. Payment status is derived from invoice balances and current delivery status rather than stored on Customer, so no database migration or manual status maintenance is required.

Sales-created orders require Manager approval only when this delivery-based customer outstanding status applies. Existing approval requests and audit snapshots are preserved; older requests display “Manager review required” instead of a retired risk classification.


A Surat Jalan may qualify an invoice through its invoice link, or through the same Sales Order when its invoice link is empty. One Delivered Surat Jalan activates the full remaining invoice balance; additional Surat Jalan do not duplicate that amount. Delivered is terminal in the normal warehouse workflow; settlement or invoice cancellation removes the qualifying balance. Invoice due dates, invoice payment status, and Receivables retain their existing rules; this delivery condition applies to customer payment status and new Sales approval decisions.

### Combined Surat Jalan

One Surat Jalan can combine completed SO/Customer PO Pick & Pack records for one customer and one destination. It begins as Draft, preserves each line source and ordered/packed snapshots, and stores outstanding delivery after Admin adjusts the final quantities. Issue locks the document; print shows only positive final quantities. Invoices and payments remain separate. Marking Delivered completes all linked inquiries and makes each eligible invoice balance count once in customer outstanding. Cancelled deliveries do not activate customer payment outstanding and cannot be reused or reopened. Follow-up shipments and multi-destination trips are not included.
