# Demo Script: CV Tajuk Revenue Cycle Information System

## Demo Objective

The objective of this demo is to show how the system supports CV Tajuk in managing the revenue cycle from customer request until payment monitoring and customer outreach. The current iteration reduces duplicate manual input by connecting Customer Inquiry, Sales Order/Customer PO, Invoice, Payment, Surat Jalan, Receivable, Collections, and Dashboard data. It also explains customer payment behaviour, compares the proposed final product price with the current-month selling average, snapshots NPWP/PPN values, and records the assigned delivery driver and vehicle.

The main flow is:

Login -> Customer -> Customer Inquiry -> Sales Order or Customer PO -> Invoice -> Printable Invoice -> Payment -> Surat Jalan -> Receivables -> Collections and Customer Outreach -> Dashboard

Immediate Payment flow: Sales Order -> Invoice -> Payment -> Surat Jalan

Credit flow: Sales Order -> Invoice -> Surat Jalan -> Receivables -> Customer Outreach -> Payment

PO flow: Customer Inquiry -> Convert to Customer PO -> Customer PO Number and required date -> Invoice -> Payment/Surat Jalan -> Inquiry Done after Delivered

## User Roles Involved

| User Role | Main Responsibility in Demo |
| --- | --- |
| Manager | Reviews dashboard, sales performance, receivables, and overdue invoices. |
| Admin | Manages customer data, invoices, payments, and receivables. |
| Sales | Creates customer inquiries, sales orders, customer purchase orders, and customer outreach notes for customers. |

## Step-by-Step Demo Flow

| Step | Page to Open | User Role | Action to Perform | Expected Result | Business Problem Solved |
| --- | --- | --- | --- | --- | --- |
| 1 | Login | Admin | Enter username `admin` and password `Admin123!`. | Admin is redirected to Dashboard. | The demo starts with simple local access control. |
| 2 | Dashboard | Manager | Show the dashboard before adding new data. | User can see total sales, paid amount, remaining amount, customers, orders, invoices, overdue invoices, recent orders, and planned customer outreach. | Management gets one place to monitor revenue cycle condition. |
| 3 | Customers | Admin | Review seeded Payment Behaviour/Type/Risk examples, then add a customer with optional NPWP. | Customer detail explains buying/payment history and shows NPWP only when provided. | Customer data and transaction decisions use visible evidence. |
| 4 | Customer Inquiry | Sales | Select Add Inquiry, choose customer, add requested items, quantity, Requested Unit Price, Agreed Unit Price, needed-by date, and save. | Inquiry is saved with Open status. | Customer requests are recorded before becoming an order. |
| 5 | Customer Inquiry Detail | Sales | Open the inquiry and select Convert to Customer PO, or Convert to Sales Order for a direct order. | The destination form is prefilled with customer, item, quantity, and Agreed Unit Price. | Sales does not retype negotiated data. |
| 6 | Sales Order / Customer PO | Sales | Select customer and product, compare customer insights and Average Sold Price, then complete Base Unit Price/markup/discount and Payment Terms. | Form shows the estimated Total, conditional PPN, and Net Sales (Margin) before save. | Sales can explain pricing, credit, and tax decisions before finalization. |
| 7 | Customer Purchase Orders | Sales | Complete Customer PO Number, required date, upload the customer PO document, and save. | Customer PO is saved with Sales Order Number, Customer PO Number, the same intelligence/tax snapshot rules, and inquiry status becomes Converted to Customer PO. | Customer PO orders use the connected revenue cycle without a separate calculation path. |
| 8 | Invoices | Admin | Open or generate the invoice from the linked order, then select View / Print Invoice. | Invoice exactly copies NPWP, PPN, Net Sales, and Total from the finalized order; non-PPN invoices omit tax identity/rows. | Printed financial values cannot drift from the approved order snapshot. |
| 9 | Payments | Admin | Select Record Payment from the invoice queue and record a partial payment. | Payment is saved, paid amount increases, remaining amount decreases, and invoice status becomes Partial. | Payment entry starts from the invoice row and avoids searching manually. |
| 10 | Surat Jalan | Admin | For Immediate Payment, create after full payment; for Credit, create before full payment if needed. Select the required driver and vehicle plate and enter Sender separately. | Delivery note saves allowlisted driver/plate snapshots and remains linked to invoice or order data. | Delivery documentation follows payment rules and identifies operational responsibility. |
| 11 | Surat Jalan | Admin | Select View / Print, verify Sender and Delivered by are separate, then mark it Delivered when complete. | Printable Surat Jalan shows driver/plate and the linked inquiry becomes Done after delivery. | The system links customer request completion to an identifiable delivery. |
| 12 | Receivables | Admin | Open Receivables and check the invoice. | Invoice appears because it still has remaining amount. Paid invoices do not appear as active receivables. | Outstanding customer balances are derived automatically from invoices. |
| 13 | Collections | Admin | Select Create Collection Task from the receivable row and save a planned reminder. | Collections form opens with customer and invoice preselected. | Admin can track collection reminders without re-entering context. |
| 14 | Dashboard | Manager | Return to Dashboard. | Dashboard totals, Surat Jalan count, receivable summary, and planned reminders reflect the new data. | Management can see updated revenue cycle information after transactions are entered. |

## Suggested Presentation Script

1. Start by explaining that this is a thesis project that can run locally and can be deployed through Vercel with Supabase for online demo or limited company-side pilot review.
2. Start from Login and explain that this is a simple demo login, not production-grade authentication.
3. Log in as Admin using `admin` and `Admin123!`.
4. Open the Dashboard and explain that it gives management a summary of sales, payment collection, open receivables, and customer outreach reminders.
5. Open Customers and add a new customer to show how master data is captured.
6. Open Customer Inquiry and create an inquiry for that customer. Explain that this captures the customer's request before it becomes an official order.
7. Convert the inquiry to Customer PO if the customer provides a PO, or to Sales Order for a normal transaction. Explain that the customer and item data are copied automatically.
8. For Customer PO, show the Customer PO Number, required date, and PO document area.
9. Open Invoices and show the invoice detail. Explain the payment terms, due date, order number, Customer PO Number when applicable, and payment status.
10. Select View / Print Invoice and show the printable invoice layout. Explain Bill To, invoice information, item table, payment terms, amount in words, payment information, and authorized signature.
11. Open Payments and record a partial payment from the invoice queue. Explain that payment cannot exceed the remaining invoice amount.
12. Open Surat Jalan and create a delivery note from the invoice. Explain the Immediate Payment rule and Credit rule.
13. Open View / Print Surat Jalan and explain the recipient section, item table, attention notes, and signature lines.
14. Open Receivables and show that the invoice still appears because it has an outstanding balance.
15. Select Create Collection Task from the receivable row and create a planned reminder for the unpaid balance.
16. Return to Dashboard and explain that the dashboard updates to support monitoring and decision-making.
17. If presenting deployment readiness, explain that the online version depends on Vercel environment variables connected to Supabase.

## How the System Supports CV Tajuk Revenue Cycle Improvement

This system improves the revenue cycle by making data flow more connected. Customer Inquiry records early customer requests and negotiation results. A valid inquiry can become a Sales Order or Customer PO without retyping customer and item data. Sales Orders and Customer Purchase Orders generate invoices. Payments update invoice balances. Surat Jalan documents delivery activity after invoice or payment activity. Receivables show unpaid or partial invoices. Collections and Customer Outreach help users remember collection and customer communication. The dashboard summarizes the flow so management can monitor sales, delivery documents, payment collection, overdue invoices, and planned customer outreach actions.

The system remains simple so it is suitable for a thesis project and easy to demonstrate during defense.
