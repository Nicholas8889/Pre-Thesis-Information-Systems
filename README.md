# CV Tajuk Revenue Cycle Information System MVP

This is a thesis MVP for demonstrating the revenue cycle flow at CV Tajuk. It covers customer inquiries, customer and product data, Sales Orders, Customer Purchase Orders (PO), invoices, payments, Surat Jalan, receivables, collection reminders, dashboard insight, and testing evidence.

The app can be run locally for thesis demonstration and can also be deployed to Vercel with Supabase PostgreSQL for online demo or limited company-side pilot review.

The second iteration reduces duplicate manual input by making Sales Order the order-processing starting point. A confirmed sales order generates a connected invoice, then payment, Surat Jalan, receivable, collection, and dashboard views reuse the same Sales Order and Invoice data.

Sales Order also records the selected payment terms. Immediate Payment means payment is required before Surat Jalan. Credit means the invoice due date follows the selected credit term and Surat Jalan can be created before full payment.

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

The seed data includes five customers, five sales orders, five invoices, paid invoices, unpaid invoices, partial invoices, overdue invoices, payments, Surat Jalan records, and collection records.

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
cd "D:\Pre Thesis MVP Iterative Development"
npm.cmd run dev
```

If port 3000 is already in use, open `http://localhost:3000` first because the app may already be running. Otherwise, run `npm.cmd run dev -- --port 3001` and open `http://localhost:3001`.

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

The integration suite uses the configured Supabase database and rolls its fixture transactions back. `npm run prisma:seed` is intentionally excluded from routine release verification because it deletes and recreates application demo records.

### How to Reset Demo Data

```bash
npm run prisma:seed
```

This command deletes and recreates the application demo records in the configured database. Do not run it against a database containing records that must be preserved.

The reset restores customers with and without NPWP, all five Customer Payment Behaviour outcomes, current-month product sales with linked Product IDs, PPN and non-PPN order/invoice snapshots, assigned Surat Jalan drivers/plates, receivables, collection, and the default demo accounts. The seed finishes by verifying these scenarios and fails if any snapshot or reconciliation rule is inconsistent.

### How to Add Another Account

1. Log in with the default Admin account.
2. Open Settings.
3. Fill username, display name, password, role, and status.
4. Select Save Account.

Roles control operational actions in this MVP. Sales can create Sales Orders and Customer Inquiries; Admin manages invoices, payments, and delivery; Manager can use all operational actions and approve risky Sales Orders.

### Recommended Demo Flow

1. Open Dashboard and explain the management summary.
2. Start from Login and enter the default Admin username and password.
3. Open Customers and add a new customer.
4. Open Sales Orders and create an order with item name, quantity, and final unit price.
5. Choose Payment Terms: Immediate Payment or Credit. If Credit is selected, choose 1 to 12 months.
6. Save the Sales Order, then use Admin or Manager access to generate the invoice when the order is eligible.
7. Open Invoices, show the generated invoice detail, then select View / Print Invoice.
8. Show the printable invoice layout with Bill To, item table, total, amount in words, payment terms, due date, payment status, and signature area.
9. Open Payments, select Record Payment from the invoice queue, and record a partial payment.
10. Open Surat Jalan and create a delivery note from the invoice. Confirm customer and item data are copied from the invoice or sales order.
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

### MVP Limitations

This is a thesis MVP. It now supports local demo usage and Vercel/Supabase deployment, but it does not include production-grade authentication, full page-level access isolation, payment gateway integration, bank integration, ERP integration, inventory management, stock movement, courier tracking, warehouse management, accounting journals, general ledger, or automated external API integration.

## Manual Demo Flow

1. Open the app and log in with the default Admin account.
2. Open Customers and select Add Customer.
3. Open Customer Inquiries, select Add Inquiry, choose the customer, and add requested item data.
4. Convert the inquiry to Sales Order for a normal order or Customer PO when the customer has a PO.
5. Complete order or PO details, choose Immediate Payment or Credit payment terms, and save.
6. Use Admin or Manager access to generate the invoice from the eligible order.
7. Open Invoices and select View / Print Invoice to show the printable invoice output.
8. Open Payments and use the invoice queue to record a partial or full payment.
9. Open Surat Jalan or select Create Surat Jalan from the invoice detail, then save the delivery note.
10. Open the printable Surat Jalan view and use Print Surat Jalan if a paper/PDF copy is needed.
11. Open Receivables and confirm only invoices with remaining balances appear.
12. Select Create Collection Task from a receivable row and save the planned reminder.
13. Return to Dashboard and confirm totals, payment-term counts, Surat Jalan count, receivables, recent orders, and collection updates.

## Main Modules

- Dashboard
- Customers
- Products
- Customer Inquiries
- Sales Orders
- Customer Purchase Orders
- Invoices
- Payments
- Surat Jalan
- Receivables
- Collections
- Customer Outreach
- Settings

## MVP Scope Limitation

This project is intentionally limited to a thesis MVP and controlled internal demo/pilot scope. It does not include payment gateway integration, bank integration, ERP features, full accounting journals, general ledger, inventory management, e-commerce checkout, advanced authentication, complex page-level role isolation, AI features, or automated external API dependencies.

## Surat Jalan Module

Surat Jalan is a simple delivery document module used after invoice and payment activity. Admin can create Surat Jalan manually, or start from an invoice so customer and sales order items are copied into the form.

To create Surat Jalan:

1. Open Invoices and select Create Surat Jalan from an invoice detail, or open Surat Jalan and select Add Surat Jalan.
2. Select the invoice, sales order, or customer.
3. Review the recipient name, phone, address, delivery date, sender, authorized person, and item rows.
4. Select the required driver and vehicle plate. Sender remains a separate field.
5. Save the Surat Jalan.
6. Select View / Print to open the printable document.
7. Select Print Surat Jalan to print or save as PDF. The print view shows the saved driver and vehicle plate, with the driver under Delivered by.

For this MVP, Surat Jalan does not move inventory stock, calculate shipping cost, connect to couriers, or manage warehouse operations. It is only a delivery-note document for thesis demonstration.

## Second Iteration Connected Flow

The intended demonstration flow is:

Customer Inquiry -> Sales Order / Customer PO -> Invoice -> Payment -> Surat Jalan -> Receivables -> Collections -> Dashboard

Customer inquiry flow:

Customer Inquiry (Open) -> Close or Cancel, or -> Convert to Sales Order / Customer PO -> Surat Jalan Delivered -> Done

Conversion is available only when every inquiry item has a matched product and agreed unit price. A Customer PO has its own Customer PO Number and requires a supporting customer PO document.

Immediate Payment flow:

Sales Order -> Invoice -> Payment -> Surat Jalan

Credit flow:

Sales Order -> Invoice -> Surat Jalan -> Receivables -> Collections -> Payment

Important rules:

- One sales order can only have one invoice.
- Every Customer PO is stored as a Sales Order with order source `CUSTOMER_PO`, a separate Customer PO Number, required date, and PO document metadata.
- Invoice data comes from the sales order and customer.
- Immediate Payment invoices use immediate due date.
- Credit invoices use the selected credit term, from 1 to 12 months.
- Payments update the invoice paid amount, remaining amount, and status.
- Immediate Payment Surat Jalan is allowed only after the invoice is Paid.
- Credit Surat Jalan is allowed after invoice generation, even before full payment.
- Receivables are not manually entered; they come from invoices with remaining balance.
- Collection tasks can be started from a receivable row so customer and invoice data are preselected.
- Surat Jalan can be started from an invoice so recipient and item data are copied.
- Invoice and Surat Jalan documents show the Customer PO Number when the linked order source is a Customer PO.

## Canonical Naming and Compatibility Routes

- Customer Purchase Orders use `SalesOrder.source = CUSTOMER_PO` and the canonical route `/customer-purchase-orders`; `/pre-orders` remains a redirect for old bookmarks.
- Collections use `CollectionTask` and `/collections`; `/billing` remains a redirect.
- Customer Outreach uses `CustomerOutreach` and `/customer-outreach`; `/follow-ups` remains a redirect.
- The canonical customer PO document API is `/api/customer-purchase-orders/[salesOrderId]/document`; the former `/api/pre-orders/...` endpoint delegates to it for compatibility.
- Payment terms are `IMMEDIATE` or `CREDIT`. Payment methods remain Cash, Bank Transfer, or Other.
- Audit records use `recordReference`, which can contain an order number, invoice number, company name, product name, or username.

## Current Base Structure

The current MVP includes database-backed pages, shared layout, Prisma schema, seed script, testing documentation, unit tests, and a clickable revenue cycle demo flow.
