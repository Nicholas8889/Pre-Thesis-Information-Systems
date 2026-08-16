# UAT Execution Template

Use this template during User Acceptance Testing. Fill the Actual Result, Status, Notes, Tester Name, and Test Date columns during testing.

| Scenario ID | User Role | Module | Test Scenario | Test Steps | Expected Result | Actual Result | Status | Notes | Tester Name | Test Date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-AUTH-001 | Admin | Login | Admin logs in | Open Login and enter default Admin username and password. | Dashboard opens after successful login. |  | Not Started |  |  |  |
| UAT-AUTH-002 | Admin | Settings | Admin adds account from Settings | Open Settings, enter username, display name, password, role, and status, then save. | New account appears in Existing Accounts and password is not displayed. |  | Not Started |  |  |  |
| UAT-AUTH-003 | Admin | Login | Inactive account is rejected | Create inactive account, log out, then try logging in with that account. | Inactive account cannot access the system. |  | Not Started |  |  |  |
| UAT-001 | Admin | Customers | Admin manages customer data | Open Customers, add a customer, view the customer detail, edit the customer, and save. | Customer is saved, visible in the list, detail is clear, and updated data is shown. |  | Not Started |  |  |  |
| UAT-002 | Sales | Sales Orders | Sales creates sales order | Open Sales Orders, select Create Sales Order, choose a customer, add item name, quantity, Base Unit Price, choose Immediate Payment or Credit terms, then save. | Sales order is created, Final Unit Price and total are calculated, Payment Terms are saved, and clean/risky customer rules are applied. |  | Not Started |  |  |  |
| UAT-003 | Admin | Invoices | Admin generates and reviews invoice | Open an eligible confirmed Sales Order, select Generate Invoice, then review copied customer, sales order, item, amount, payment terms, issue date, and due date data. | Invoice is generated from sales order data, Immediate Payment due date is immediate, Credit due date follows selected month term, and status starts as Unpaid. |  | Not Started |  |  |  |
| UAT-TERM-001 | Admin | Surat Jalan | Immediate Payment requires payment before Surat Jalan | Create Immediate Payment sales order and invoice, try Surat Jalan before payment, record full payment, then create Surat Jalan. | Surat Jalan is blocked before payment and allowed after invoice is Paid. |  | Not Started |  |  |  |
| UAT-TERM-002 | Admin | Surat Jalan | Credit allows Surat Jalan before payment | Create Credit 3-month sales order and invoice, then create Surat Jalan before recording payment. | Surat Jalan can be created and invoice appears as active receivable until paid. |  | Not Started |  |  |  |
| UAT-INV-PRINT-01 | Admin | Invoices | Admin views and prints invoice document | Open Invoices, view invoice detail, select View / Print Invoice, and review invoice output. | System displays printable invoice with customer data, invoice items, total amount, payment status, and signature area. |  | Not Started |  |  |  |
| UAT-004 | Admin | Payments | Admin records payment from queue | Open Payments, select Record Payment from an invoice row, enter payment amount, date, method, and save. | Payment is recorded, paid amount increases, remaining amount decreases, and status updates correctly. |  | Not Started |  |  |  |
| UAT-005 | Admin | Receivables | Admin checks receivables | Open Receivables after recording partial payment. | Only invoices with remaining amount appear. Paid invoices do not appear as active receivables. |  | Not Started |  |  |  |
| UAT-006 | Sales | Customer Outreach | Sales records a customer product contact | Open Customer Outreach, select a customer, enter the contact date and optional product-conversation note, then save. | Customer Outreach is saved as a customer contact without invoice, payment, or collection fields. |  | Not Started |  |  |  |
| UAT-007 | Manager | Dashboard | Manager checks dashboard | Open Dashboard after customer, order, invoice, payment, Surat Jalan, receivable, Collection Task, and Customer Outreach actions. | Dashboard shows updated totals, recent sales orders, recent invoices, recent payments, receivable summary, overdue and Collection Task counts, Surat Jalan count, and canonical outreach reminders. |  | Not Started |  |  |  |
| UAT-CI-001 | Sales | Customer Inquiry | Sales creates customer inquiry | Open Customer Inquiries, add an inquiry, select customer, add multiple items, quantities, requested prices, agreed prices, needed-by date, and save. | Inquiry is created with Open status and all item lines are visible in detail. |  | Not Started |  |  |  |
| UAT-CI-002 | Sales | Customer Inquiry | Sales closes or cancels inquiry | Open an Open inquiry, enter a reason, then select Close Inquiry or Cancel Inquiry. | Inquiry status becomes Closed or Cancelled and the reason is retained. |  | Not Started |  |  |  |
| UAT-CI-003 | Sales or Manager | Customer Inquiry / Sales Orders | Convert inquiry to Sales Order | Open an eligible Open inquiry, select Convert to Sales Order, confirm copied customer and item data, then save. | Sales Order is created and inquiry status becomes Converted to SO after save. |  | Not Started |  |  |  |
| UAT-CI-004 | Sales or Manager | Customer Inquiry / Customer Purchase Orders | Convert inquiry to Customer PO | Open an eligible Open inquiry, select Convert to Customer PO, complete Customer PO Number, required date, payment terms, and customer PO document, then save. | Customer PO is created with Sales Order Number and Customer PO Number, and inquiry status becomes Converted to Customer PO after save. |  | Not Started |  |  |  |
| UAT-CI-005 | Admin or Manager | Surat Jalan / Customer Inquiry | Delivered order completes inquiry | Complete invoice and delivery process for an inquiry-linked order, mark Surat Jalan Delivered, then reopen the inquiry. | Inquiry status becomes Done after linked delivery is completed. |  | Not Started |  |  |  |
| UAT-DEPLOY-001 | Project Owner | Vercel | Vercel deployment uses Supabase variables | Confirm Vercel project has `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_CUSTOMER_PO_BUCKET`, then redeploy. | Vercel build completes and deployment status becomes Ready. |  | Not Started |  |  |  |

## Status Options

- Not Started
- Passed
- Failed
- Needs Revision
