# BUILD_MVP.md — End-to-End MVP Build Instruction

## 1. Goal

Build an end-to-end local MVP web application for:

**CV Tajuk Revenue Cycle Information System**

This is a thesis MVP, not a production system. The application should be simple, usable, and complete enough to demonstrate the revenue cycle flow from customer data to sales order, invoice, payment, receivable monitoring, follow-up, dashboard, and testing evidence.

The MVP must run locally and be easy to explain during thesis defense.

## 2. Main Objective

Create a working end-to-end MVP where a user can:

1. Manage customer data.
2. Create sales orders.
3. Generate invoices from sales orders.
4. Record payments.
5. Monitor receivables and overdue invoices.
6. Create follow-up notes for customers or unpaid invoices.
7. View dashboard insight.

## 3. Tech Stack

Use:

* Next.js
* TypeScript
* Tailwind CSS
* Prisma
* SQLite

The app must run locally using:

```bash
npm run dev
```

Use SQLite because this MVP is only for local thesis demonstration.

## 4. App Pages

Create these pages:

### Dashboard

Path:

```txt
/
```

Show:

* Total sales
* Total paid amount
* Total unpaid amount
* Number of customers
* Number of sales orders
* Number of invoices
* Number of overdue invoices
* Recent sales orders
* Follow-up reminders
* Simple sales/receivable summary

### Customers

Path:

```txt
/customers
```

Features:

* View customer list
* Add customer
* Edit customer
* Delete customer if safe
* Search customer
* View customer detail

Customer fields:

* Customer name
* Company name
* Phone
* Email
* Address
* Customer type
* Notes
* Status

### Sales Orders

Path:

```txt
/sales-orders
```

Features:

* View sales order list
* Create sales order
* Select customer
* Add one or more order items
* Input item name, quantity, unit price
* Calculate subtotal and total
* Edit sales order status
* Generate invoice from sales order

Sales order statuses:

* Draft
* Confirmed
* Shipped
* Invoiced
* Cancelled

### Invoices

Path:

```txt
/invoices
```

Features:

* View invoice list
* View invoice detail
* Generate invoice from sales order
* Show customer data
* Show invoice number
* Show issue date
* Show due date
* Show invoice total
* Show payment status
* Show printable/simple invoice view

Invoice statuses:

* Unpaid
* Partial
* Paid
* Overdue
* Cancelled

### Payments

Path:

```txt
/payments
```

Features:

* View payment list
* Record payment for invoice
* Support partial payment
* Support full payment
* Automatically update invoice payment status
* Show payment history

Payment fields:

* Invoice
* Payment date
* Payment amount
* Payment method
* Notes

Payment methods:

* Cash
* Bank Transfer
* Other

### Receivables

Path:

```txt
/receivables
```

Features:

* Show unpaid invoices
* Show partial invoices
* Show overdue invoices
* Show customer name
* Show due date
* Show remaining amount
* Show status badge
* Filter by status

### Follow-ups

Path:

```txt
/follow-ups
```

Features:

* View follow-up list
* Add follow-up
* Link follow-up to customer
* Optionally link follow-up to invoice
* Set follow-up date
* Set follow-up status
* Add follow-up notes

Follow-up statuses:

* Planned
* Done
* Cancelled

## 5. Data Models

Create a Prisma schema with these models:

### Customer

Fields:

* id
* name
* companyName
* phone
* email
* address
* customerType
* status
* notes
* createdAt
* updatedAt

### SalesOrder

Fields:

* id
* orderNumber
* customerId
* orderDate
* status
* subtotal
* total
* notes
* createdAt
* updatedAt

### SalesOrderItem

Fields:

* id
* salesOrderId
* itemName
* quantity
* unitPrice
* subtotal

### Invoice

Fields:

* id
* invoiceNumber
* salesOrderId
* customerId
* issueDate
* dueDate
* totalAmount
* paidAmount
* remainingAmount
* status
* notes
* createdAt
* updatedAt

### Payment

Fields:

* id
* invoiceId
* paymentDate
* amount
* paymentMethod
* notes
* createdAt
* updatedAt

### FollowUp

Fields:

* id
* customerId
* invoiceId optional
* followUpDate
* status
* notes
* createdAt
* updatedAt

## 6. Business Logic

Implement these business rules:

### Sales Order Calculation

* Sales order item subtotal = quantity × unit price.
* Sales order total = sum of all item subtotals.

### Invoice Generation

* Invoice can be generated from a sales order.
* One sales order should only generate one invoice.
* Invoice total should follow sales order total.
* Invoice status starts as unpaid.
* Invoice due date should be editable or default to 14 days after issue date.

### Payment Logic

* Payment can be recorded against an invoice.
* Paid amount = sum of all payments for the invoice.
* Remaining amount = invoice total - paid amount.
* If paid amount is 0, status is unpaid.
* If paid amount is more than 0 but less than total, status is partial.
* If paid amount is equal to total, status is paid.
* If due date has passed and remaining amount is more than 0, status is overdue.
* Payment amount cannot exceed remaining invoice amount.

### Receivable Logic

* Receivables page should show invoices with remaining amount more than 0.
* Paid invoices should not appear as active receivables.
* Overdue invoices should be clearly marked.

### Follow-up Logic

* Follow-up can be created for a customer.
* Follow-up can optionally be connected to an unpaid or overdue invoice.
* Follow-up reminders should appear on the dashboard if status is planned.

## 7. UI Direction

Keep the UI:

* Simple
* Clean
* Modern
* Easy to use
* Suitable for non-technical users
* Suitable for thesis demonstration

Use:

* Sidebar navigation
* Page title and description
* Cards for summary data
* Tables for lists
* Forms for create/edit
* Status badges
* Clear action buttons
* Empty states

Avoid:

* Complex animations
* Too many colors
* Overly advanced dashboard
* Complex authentication
* Complex permission system
* External API integration

## 8. Demo Data

Create seed data for demo:

At minimum:

* 5 customers
* 5 sales orders
* 5 invoices
* Some paid invoices
* Some unpaid invoices
* Some partial invoices
* Some overdue invoices
* Some follow-up records

The seed data should make the dashboard, receivables, and follow-up pages meaningful during demo.

## 9. Testing Requirement

Add basic tests or testing documentation for the MVP.

Prioritize these:

### Unit Testing

Create tests for:

* Sales order total calculation
* Invoice payment status calculation
* Remaining amount calculation
* Overdue status calculation

### Integration Testing / SIT

Create or document scenarios for:

* Customer → Sales Order
* Sales Order → Invoice
* Invoice → Payment
* Invoice → Receivable Status
* Customer/Invoice → Follow-up

### System Acceptance Testing / SAT

Create checklist scenarios to verify:

* All major modules can be accessed.
* Customer data can be managed.
* Sales order can be created.
* Invoice can be generated.
* Payment can be recorded.
* Receivable status updates correctly.
* Dashboard reflects data correctly.

### User Acceptance Testing / UAT

Create task-based scenarios for:

* Manager
* Admin
* Sales

Examples:

* Admin records a new customer.
* Sales creates a sales order.
* Admin generates an invoice.
* Admin records a payment.
* Manager checks dashboard and overdue receivables.
* Sales creates follow-up note for unpaid customer.

Create or update:

```txt
docs/TESTING_MATRIX.md
docs/UAT_SCENARIOS.md
```

## 10. README Requirement

Create or update `README.md` with:

* Project title
* Project description
* Tech stack
* How to install dependencies
* How to setup database
* How to seed database
* How to run locally
* How to run tests
* Main modules
* MVP scope limitation

## 11. Important Constraints

Do not add:

* Production deployment
* Bank integration
* Payment gateway
* ERP features
* Full accounting journal
* General ledger
* Inventory management
* E-commerce checkout
* Advanced authentication
* Complex role-based access control
* AI features
* External API dependency

Only build the end-to-end MVP needed for thesis demonstration.

## 12. Completion Criteria

The MVP is considered complete when:

* The app runs locally.
* All main pages are accessible.
* Customer CRUD works.
* Sales order creation works.
* Invoice generation works.
* Payment recording works.
* Receivable status updates correctly.
* Follow-up creation works.
* Dashboard shows meaningful data.
* Seed data exists.
* Testing evidence exists.
* README explains how to run the project.
* The system remains simple and aligned with thesis scope.

## 13. Final Output Expected from Codex

After building, summarize:

* What was implemented
* What files were created or changed
* How to run the app
* How to seed the database
* How to run tests
* What assumptions were made
* What can be improved later
