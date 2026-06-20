# Demo Script: CV Tajuk Revenue Cycle Information System MVP

## Demo Objective

The objective of this demo is to show how the MVP supports CV Tajuk in managing the revenue cycle from customer data until payment monitoring and follow-up. The second iteration reduces duplicate manual input by connecting each transaction module through Sales Order and Invoice data. It also shows two payment-term paths: Debit for immediate payment and Credit for term-based receivables.

The main flow is:

Login -> Customer -> Sales Order -> Invoice -> Printable Invoice -> Payment -> Surat Jalan -> Receivables -> Follow-up -> Dashboard

Debit flow: Sales Order -> Invoice -> Payment -> Surat Jalan

Credit flow: Sales Order -> Invoice -> Surat Jalan -> Receivables -> Follow-up -> Payment

## User Roles Involved

| User Role | Main Responsibility in Demo |
| --- | --- |
| Manager | Reviews dashboard, sales performance, receivables, and overdue invoices. |
| Admin | Manages customer data, invoices, payments, and receivables. |
| Sales | Creates sales orders and follow-up notes for customers. |

## Step-by-Step Demo Flow

| Step | Page to Open | User Role | Action to Perform | Expected Result | Business Problem Solved |
| --- | --- | --- | --- | --- | --- |
| 1 | Login | Admin | Enter username `admin` and password `Admin123!`. | Admin is redirected to Dashboard. | The demo starts with simple local access control. |
| 2 | Dashboard | Manager | Show the dashboard before adding new data. | User can see total sales, paid amount, remaining amount, customers, orders, invoices, overdue invoices, recent orders, and planned follow-ups. | Management gets one place to monitor revenue cycle condition. |
| 3 | Customers | Admin | Select Add Customer and enter customer information. | New customer appears in the customer list and can be viewed in detail. | Customer data becomes organized and reusable for sales orders and invoices. |
| 4 | Sales Orders | Sales | Select Create Sales Order, choose the customer, add order items, choose Debit or Credit payment term, and select Confirm & Generate Invoice. | Sales order is saved with automatic subtotal and total calculation, and one invoice is generated. | Sales Order becomes the start of the connected revenue cycle. |
| 5 | Invoices | Admin | Open the generated invoice from the sales order. | Invoice shows copied customer data, sales order number, item rows, total, payment term, issue date, due date, and Unpaid status. | Admin does not retype customer, order, item, or payment-term data. |
| 6 | Invoices | Admin | Open the generated invoice detail. | Invoice shows customer data, invoice number, issue date, due date, total amount, paid amount, remaining amount, status, and item lines. | Invoice information is easier to review and explain. |
| 7 | Invoices | Admin | Select View / Print Invoice. | Printable invoice opens with Bill To, invoice information, item table, amount in words, payment information, and signature area. | The MVP can show a digital invoice output aligned with the real Faktur document style. |
| 8 | Payments | Admin | Select Record Payment from the invoice queue and record a partial payment. | Payment is saved, paid amount increases, remaining amount decreases, and invoice status becomes Partial. | Payment entry starts from the invoice row and avoids searching manually. |
| 9 | Surat Jalan | Admin | For Debit, create Surat Jalan after full payment. For Credit, create Surat Jalan from the invoice before full payment if needed. | Delivery note is saved and linked to invoice or sales order data. | Delivery documentation follows the selected payment-term flow. |
| 10 | Surat Jalan | Admin | Select View / Print on the Surat Jalan record. | Printable Surat Jalan opens with recipient, item table, attention notes, and signature lines. | The MVP can show a delivery document output based on the real business document. |
| 11 | Receivables | Admin | Open Receivables and check the invoice. | Invoice appears because it still has remaining amount. Paid invoices do not appear as active receivables. | Outstanding customer balances are derived automatically from invoices. |
| 12 | Follow-ups | Sales | Select Create Follow-up from the receivable row and save a reminder. | Follow-up form opens with customer and invoice preselected. | Sales/Admin can track collection reminders without re-entering context. |
| 13 | Dashboard | Manager | Return to Dashboard. | Dashboard totals, Surat Jalan count, receivable summary, and planned follow-ups reflect the new data. | Management can see updated revenue cycle information after transactions are entered. |

## Suggested Presentation Script

1. Start by explaining that this MVP is local-only and built for thesis demonstration, not production deployment.
2. Start from Login and explain that this is a simple local demo login, not production authentication.
3. Log in as Admin using `admin` and `Admin123!`.
4. Open the Dashboard and explain that it gives management a summary of sales, payment collection, open receivables, and follow-up reminders.
5. Open Customers and add a new customer to show how master data is captured.
6. Open Sales Orders and create a new sales order for that customer. Explain that the system calculates item subtotals and total automatically.
7. Choose Debit or Credit. Explain that Debit means immediate payment, while Credit requires a 1-12 month term.
8. Select Confirm & Generate Invoice. Explain that one sales order can only generate one invoice and that invoice data is copied from the sales order.
9. Open Invoices and show the invoice detail. Explain the payment term, due date, and payment status.
10. Select View / Print Invoice and show the printable invoice layout. Explain Bill To, invoice information, item table, payment term, amount in words, payment information, and authorized signature.
11. Open Payments and record a partial payment from the invoice queue. Explain that payment cannot exceed the remaining invoice amount.
12. Open Surat Jalan and create a delivery note from the invoice. Explain the Debit rule and Credit rule.
13. Open View / Print Surat Jalan and explain the recipient section, item table, attention notes, and signature lines.
14. Open Receivables and show that the invoice still appears because it has an outstanding balance.
15. Select Create Follow-up from the receivable row and create a planned reminder for the unpaid balance.
16. Return to Dashboard and explain that the dashboard updates to support monitoring and decision-making.

## How the MVP Supports CV Tajuk Revenue Cycle Improvement

This MVP improves the revenue cycle by making data flow more connected. Customer data is selected when creating sales orders. Sales orders generate invoices. Payments update invoice balances. Surat Jalan documents delivery activity after invoice or payment activity. Receivables show unpaid or partial invoices. Follow-ups help users remember customer communication. The dashboard summarizes the flow so management can monitor sales, delivery documents, payment collection, overdue invoices, and planned follow-up actions.

The system remains simple so it is suitable for a thesis MVP and easy to demonstrate during defense.
