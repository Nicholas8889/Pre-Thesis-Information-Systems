# CV Tajuk Revenue Cycle Information System MVP

This is a local thesis MVP for demonstrating the revenue cycle flow at CV Tajuk. It covers customer data, sales orders, invoices, payments, Surat Jalan, receivables, billing reminders, dashboard insight, and testing evidence.

The second iteration reduces duplicate manual input by making Sales Order the transaction starting point. A confirmed sales order generates a connected invoice, then payment, Surat Jalan, receivable, billing, and dashboard views reuse the same Sales Order and Invoice data.

Sales Order also records the selected payment term. Debit means immediate payment is required before Surat Jalan. Credit means the invoice due date follows the selected credit term and Surat Jalan can be created before full payment.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- SQLite
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

Generate Prisma client and apply the included SQLite migration:

```bash
npm run prisma:generate
npm run prisma:deploy
```

For future schema changes during development, create a new migration with `npm run prisma:migrate -- --name change_name`.

## Seed Database

```bash
npm run prisma:seed
```

The seed data includes five customers, five sales orders, five invoices, paid invoices, unpaid invoices, partial invoices, overdue invoices, payments, Surat Jalan records, and billing records.

## Run Locally

```bash
npm run dev
```

Open the local URL shown in the terminal.

## Run Tests

```bash
npm run test
```

## Thesis Demo Guide

### Demo Login

The app uses a simple local-only login for thesis demonstration.

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

### How to Reset Demo Data

```bash
npm run prisma:seed
```

This restores the prepared local demo data for customers, sales orders, invoices, payments, Surat Jalan, receivables, and billing.
It also restores the default Admin login account.

### How to Add Another Account

1. Log in with the default Admin account.
2. Open Settings.
3. Fill username, display name, password, role, and status.
4. Select Save Account.

Roles are shown as account information only. They do not control access in this MVP.

### Recommended Demo Flow

1. Open Dashboard and explain the management summary.
2. Start from Login and enter the default Admin username and password.
3. Open Customers and add a new customer.
4. Open Sales Orders and create an order with item name, quantity, and unit price.
5. Choose Payment Method / Term: Debit or Credit. If Credit is selected, choose 1 to 12 months.
6. Select Confirm & Generate Invoice. The invoice is created from the sales order without retyping customer or item data.
7. Open Invoices, show the generated invoice detail, then select View / Print Invoice.
8. Show the printable invoice layout with Bill To, item table, total, amount in words, payment term, due date, payment status, and signature area.
9. Open Payments, select Record Payment from the invoice queue, and record a partial payment.
10. Open Surat Jalan and create a delivery note from the invoice. Confirm customer and item data are copied from the invoice or sales order.
11. Select View / Print to show the printable Surat Jalan document with recipient, item table, attention notes, and signature lines.
12. Open Receivables and show the remaining balance derived from the invoice.
13. Select Create Billing from the receivable row and save a planned reminder.
14. Return to Dashboard and show the updated totals, payment-term counts, Surat Jalan count, and billing reminder.

### How to Run Tests

```bash
npm run lint
npm run test
npm run build
```

### MVP Limitations

This is a local thesis MVP. It does not include production-grade authentication, role-based access control, production deployment, payment gateway integration, bank integration, ERP integration, inventory management, stock movement, courier tracking, warehouse management, accounting journals, general ledger, or external API integration.

## Manual Demo Flow

1. Open the app and log in with the default Admin account.
2. Open Customers and select Add Customer.
3. Open Sales Orders, select Create Sales Order, choose the customer, and add order items.
4. Choose Debit or Credit payment term. For Credit, choose the number of months.
5. Select Confirm & Generate Invoice so the system creates the sales order and matching invoice together.
6. Open Invoices and select View / Print Invoice to show the printable invoice output.
7. Open Payments and use the invoice queue to record a partial or full payment.
8. Open Surat Jalan or select Create Surat Jalan from the invoice detail, then save the delivery note.
9. Open the printable Surat Jalan view and use Print Surat Jalan if a paper/PDF copy is needed.
10. Open Receivables and confirm only invoices with remaining balances appear.
11. Select Create Billing from a receivable row and save the planned reminder.
12. Return to Dashboard and confirm totals, payment-term counts, Surat Jalan count, receivables, recent orders, and billing updates.

## Main Modules

- Dashboard
- Customers
- Sales Orders
- Invoices
- Payments
- Surat Jalan
- Receivables
- Billing
- Follow Up
- Settings

## MVP Scope Limitation

This project is intentionally limited to a local thesis demonstration. It does not include production deployment, payment gateway integration, bank integration, ERP features, full accounting journals, general ledger, inventory management, e-commerce checkout, advanced authentication, complex role-based access control, AI features, or external API dependencies.

## Surat Jalan Module

Surat Jalan is a simple delivery document module used after invoice and payment activity. Admin can create Surat Jalan manually, or start from an invoice so customer and sales order items are copied into the form.

To create Surat Jalan:

1. Open Invoices and select Create Surat Jalan from an invoice detail, or open Surat Jalan and select Add Surat Jalan.
2. Select the invoice, sales order, or customer.
3. Review the recipient name, phone, address, delivery date, sender, authorized person, and item rows.
4. Save the Surat Jalan.
5. Select View / Print to open the printable document.
6. Select Print Surat Jalan to print or save as PDF.

For this MVP, Surat Jalan does not move inventory stock, calculate shipping cost, connect to couriers, or manage warehouse operations. It is only a delivery-note document for thesis demonstration.

## Second Iteration Connected Flow

The intended demonstration flow is:

Sales Order -> Invoice -> Payment -> Surat Jalan -> Receivables -> Billing -> Dashboard

Debit flow:

Sales Order -> Invoice -> Payment -> Surat Jalan

Credit flow:

Sales Order -> Invoice -> Surat Jalan -> Receivables -> Billing -> Payment

Important rules:

- One sales order can only have one invoice.
- Invoice data comes from the sales order and customer.
- Debit invoices use immediate due date.
- Credit invoices use the selected credit term, from 1 to 12 months.
- Payments update the invoice paid amount, remaining amount, and status.
- Debit Surat Jalan is allowed only after the invoice is Paid.
- Credit Surat Jalan is allowed after invoice generation, even before full payment.
- Receivables are not manually entered; they come from invoices with remaining balance.
- Billing activities can be started from a receivable row so customer and invoice data are preselected.
- Surat Jalan can be started from an invoice so recipient and item data are copied.

## Current Base Structure

The current MVP includes database-backed pages, shared layout, Prisma schema, seed script, testing documentation, unit tests, and a clickable revenue cycle demo flow.
