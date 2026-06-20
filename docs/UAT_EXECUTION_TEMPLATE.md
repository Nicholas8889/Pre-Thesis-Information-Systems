# UAT Execution Template

Use this template during User Acceptance Testing. Fill the Actual Result, Status, Notes, Tester Name, and Test Date columns during testing.

| Scenario ID | User Role | Module | Test Scenario | Test Steps | Expected Result | Actual Result | Status | Notes | Tester Name | Test Date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-AUTH-001 | Admin | Login | Admin logs in | Open Login and enter default Admin username and password. | Dashboard opens after successful login. |  | Not Started |  |  |  |
| UAT-AUTH-002 | Admin | Settings | Admin adds account from Settings | Open Settings, enter username, display name, password, role, and status, then save. | New account appears in Existing Accounts and password is not displayed. |  | Not Started |  |  |  |
| UAT-AUTH-003 | Admin | Login | Inactive account is rejected | Create inactive account, log out, then try logging in with that account. | Inactive account cannot access the system. |  | Not Started |  |  |  |
| UAT-001 | Admin | Customers | Admin manages customer data | Open Customers, add a customer, view the customer detail, edit the customer, and save. | Customer is saved, visible in the list, detail is clear, and updated data is shown. |  | Not Started |  |  |  |
| UAT-002 | Sales | Sales Orders | Sales creates sales order and invoice | Open Sales Orders, select Create Sales Order, choose a customer, add item name, quantity, unit price, choose Debit or Credit term, then select Confirm & Generate Invoice. | Sales order is created, total is calculated, payment term is saved, and one connected invoice is generated. |  | Not Started |  |  |  |
| UAT-003 | Admin | Invoices | Admin reviews generated invoice | Open Invoices after sales order confirmation and review copied customer, sales order, item, amount, payment term, issue date, and due date data. | Invoice is generated from sales order data, Debit due date is immediate, Credit due date follows selected month term, and status starts as Unpaid. |  | Not Started |  |  |  |
| UAT-TERM-001 | Admin | Surat Jalan | Debit requires payment before Surat Jalan | Create Debit sales order and invoice, try Surat Jalan before payment, record full payment, then create Surat Jalan. | Surat Jalan is blocked before payment and allowed after invoice is Paid. |  | Not Started |  |  |  |
| UAT-TERM-002 | Admin | Surat Jalan | Credit allows Surat Jalan before payment | Create Credit 3-month sales order and invoice, then create Surat Jalan before recording payment. | Surat Jalan can be created and invoice appears as active receivable until paid. |  | Not Started |  |  |  |
| UAT-INV-PRINT-01 | Admin | Invoices | Admin views and prints invoice document | Open Invoices, view invoice detail, select View / Print Invoice, and review invoice output. | System displays printable invoice with customer data, invoice items, total amount, payment status, and signature area. |  | Not Started |  |  |  |
| UAT-004 | Admin | Payments | Admin records payment from queue | Open Payments, select Record Payment from an invoice row, enter payment amount, date, method, and save. | Payment is recorded, paid amount increases, remaining amount decreases, and status updates correctly. |  | Not Started |  |  |  |
| UAT-005 | Admin | Receivables | Admin checks receivables | Open Receivables after recording partial payment. | Only invoices with remaining amount appear. Paid invoices do not appear as active receivables. |  | Not Started |  |  |  |
| UAT-006 | Sales | Follow-ups | Sales creates follow-up from receivable | Open Receivables, select Create Follow-up from a row, enter date, status, and notes, then save. | Follow-up is saved with customer and invoice context and planned follow-up appears on the dashboard. |  | Not Started |  |  |  |
| UAT-007 | Manager | Dashboard | Manager checks dashboard | Open Dashboard after customer, order, invoice, payment, Surat Jalan, receivable, and follow-up actions. | Dashboard shows updated totals, recent sales orders, recent invoices, recent payments, receivable summary, overdue count, Surat Jalan count, and planned follow-ups. |  | Not Started |  |  |  |

## Status Options

- Not Started
- Passed
- Failed
- Needs Revision
