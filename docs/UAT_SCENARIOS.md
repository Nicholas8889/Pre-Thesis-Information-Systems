# UAT Scenarios

## UAT-AUTH-001: Admin Logs In

Role: Admin

Steps:
1. Open the app.
2. Confirm Login page appears.
3. Enter username `admin`.
4. Enter password `Admin123!`.
5. Select Login.

Expected result: Dashboard opens after successful login.

## UAT-AUTH-002: Admin Adds Account From Settings

Role: Admin

Steps:
1. Log in as Admin.
2. Open Settings.
3. Enter username, display name, password, role, and status.
4. Save the account.

Expected result: New account appears in Existing Accounts and password is not displayed.

## UAT-AUTH-003: Inactive Account Is Rejected

Role: Admin

Steps:
1. Log in as Admin.
2. Open Settings.
3. Create an inactive account.
4. Log out.
5. Try logging in with the inactive account.

Expected result: Inactive account cannot access the system.

## UAT-001: Admin Records a New Customer

Role: Admin

Steps:
1. Open Customers.
2. Select Add Customer.
3. Enter Contact Person, Company Name, phone, email, address, Customer Segment, status, and notes.
4. Save the customer.

Expected result: The new customer appears in the customer list and can be selected for a sales order.

## UAT-002: Sales Creates a Sales Order

Role: Sales

Steps:
1. Open Sales Orders.
2. Select Create Order.
3. Select a customer.
4. Add one or more items with quantity and Base Unit Price; verify each Final Unit Price.
5. Choose Payment Terms: Immediate Payment or Credit.
6. If Credit is selected, choose a credit term from 1 to 12 months.
7. Save the Sales Order.

Expected result: The sales order appears with correct subtotal and total. If the customer is clean, the order is confirmed and ready for Admin or Manager invoice generation. If the customer has payment risk, the order waits for Manager approval.

## UAT-003: Admin Generates an Invoice

Role: Admin

Steps:
1. Open Sales Orders.
2. Open an eligible confirmed sales order without an invoice.
3. Select Generate Invoice.
4. Review issue date, due date, payment terms, customer, sales order number, item rows, and invoice total.

Expected result: The invoice total matches the sales order total, the payment terms are copied, the due date follows Immediate Payment or Credit rules, and no customer/order/item data must be retyped.

## UAT-TERM-001: Immediate Payment Flow Requires Payment Before Surat Jalan

Role: Admin

Steps:
1. Create a Sales Order with Payment Terms = Immediate Payment.
2. Confirm and generate invoice.
3. Open the generated invoice.
4. Confirm due date is the same as issue date.
5. Try to create Surat Jalan before payment.
6. Record full payment.
7. Create Surat Jalan again.

Expected result: Immediate Payment invoice requires payment before Surat Jalan can be created.

## UAT-TERM-002: Credit Flow Allows Surat Jalan Before Payment

Role: Admin

Steps:
1. Create a Sales Order with Payment Terms = Credit.
2. Choose Credit Term = 3 months.
3. Confirm and generate invoice.
4. Confirm due date is 3 months after issue date.
5. Create Surat Jalan before payment.
6. Open Receivables and confirm the invoice appears.
7. Create Collection Task from the receivable row.

Expected result: Credit invoice allows Surat Jalan before payment and remains active as a receivable until paid.

## UAT-004: Admin Records a Payment

Role: Admin

Steps:
1. Open Payments.
2. Select Record Payment from an unpaid or partial invoice row.
4. Enter payment date, amount, method, and notes.
5. Save the payment.

Expected result: The invoice paid amount, remaining amount, and status update correctly.

## UAT-INV-PRINT-01: Admin Views and Prints Invoice Document

Role: Admin

Steps:
1. Open Invoices.
2. Select an invoice from the list.
3. Select View / Print Invoice.
4. Review customer data, invoice number, invoice date, due date, item table, total amount, paid amount, remaining amount, payment status, amount in words, and signature area.
5. Select Print Invoice if a printed or PDF copy is needed.

Expected result: The printable invoice opens clearly and shows customer data, invoice items, total amount, payment status, and signature area.

## UAT-SJ-001: Admin Creates Surat Jalan From Invoice

Role: Admin

Steps:
1. Open Invoices.
2. Select an invoice from the list.
3. Select Create Surat Jalan.
4. Confirm invoice, customer, recipient, and item rows are copied into the form.
5. Save the Surat Jalan.

Expected result: Surat Jalan is created and linked to invoice or sales order data.

## UAT-SJ-002: Admin Creates Surat Jalan Manually

Role: Admin

Steps:
1. Open Surat Jalan from the sidebar.
2. Select Add Surat Jalan.
3. Select a customer.
4. Enter recipient, delivery date, sender, authorized person, notes, and item rows.
5. Save the Surat Jalan.

Expected result: Manual Surat Jalan appears in the Surat Jalan list.

## UAT-SJ-003: Admin Prints Surat Jalan

Role: Admin

Steps:
1. Open Surat Jalan.
2. Select a Surat Jalan record.
3. Select View / Print.
4. Review recipient section, document number, date, item table, attention notes, and signature area.
5. Select Print Surat Jalan if a printed or PDF copy is needed.

Expected result: Printable Surat Jalan opens clearly and can be printed.

## UAT-SJ-004: Admin Assigns Driver and Vehicle

Role: Admin or Manager

Steps:

1. Start Surat Jalan creation manually or from an Invoice, Sales Order, or Customer PO.
2. Confirm neither delivery dropdown is preselected.
3. Select a Driver Name and Vehicle Plate Number.
4. Enter Sender Name separately and save the Surat Jalan.
5. Open the saved Surat Jalan detail and printable document.
6. Confirm the selected driver and vehicle plate are shown and Delivered by uses the driver, not the sender.

Expected result: The required allowlisted delivery assignment is stored as a Surat Jalan snapshot and appears consistently on detail and print views.

## UAT-B9-001: Intelligence-to-Delivery Demonstration

Roles: Sales, Admin, and Manager

Precondition: Use an approved demo database reset with the current seed. The seed command deletes and recreates application demo records.

Steps:

1. Open Customers and locate examples of Immediate Payment, Short-Term Credit, Long-Term Credit, Mixed, and No Payment History.
2. Open Products and confirm at least one product shows a current-month Average Sold Price with quantity/value evidence.
3. Start a Sales Order or Customer PO for a seeded customer with NPWP and confirm the live estimate shows NPWP, PPN, Net Sales (Margin), and Total.
4. Repeat with a customer without NPWP and confirm PPN is not applied and Net Sales equals Total.
5. Finalize an eligible order, generate its Invoice, and confirm the Invoice tax snapshot exactly matches the order.
6. Create Surat Jalan, choose an allowlisted driver and vehicle plate, and enter Sender separately.
7. Open the Surat Jalan detail and print view; confirm Driver, Vehicle Plate, Sender, and Delivered by are correct.
8. Review Audit Trail using the finalized record references.

Expected result: Customer intelligence, final product pricing, tax identity, Invoice totals, and delivery assignment stay consistent and explainable throughout the connected revenue-cycle flow.

## UAT-005: Manager Reviews Dashboard and Receivables

Role: Manager

Steps:
1. Open Dashboard.
2. Review total sales, paid amount, unpaid amount, and overdue invoices.
3. Open Receivables.
4. Review unpaid, partial, and overdue invoices.
5. Select Create Collection Task from a receivable row and confirm the customer and invoice are preselected.

Expected result: Dashboard and receivables show accurate, easy-to-read revenue cycle status, and a Collection Task can start from receivable data.

## UAT-006: Sales Creates Customer Outreach Note

Role: Sales

Steps:
1. Open Customer Outreach.
2. Select a customer or use Record Contact from a customer row.
3. Set the contact date.
4. Add an optional product or conversation note.
5. Save the customer outreach record.

Expected result: The customer's latest contact date and note update, and the audit entity is `CUSTOMER_OUTREACH`.

## UAT-CI-001: Sales Creates a Multi-Item Customer Inquiry

Role: Sales

Steps:
1. Open Customer Inquiries.
2. Select Add Customer Inquiry.
3. Select an active customer.
4. Add two or more requested items with quantities and requested prices.
5. Match each available item to a Product and enter its Agreed Unit Price.
6. Save the inquiry.

Expected result: One Open inquiry is created with all item lines visible in its detail page.

## UAT-CI-002: Sales Closes or Cancels an Inquiry

Role: Sales

Steps:
1. Open an Open Customer Inquiry using the eye icon.
2. Enter a reason for price/timing failure and select Close Inquiry, or enter a cancellation reason and select Cancel Inquiry.

Expected result: The status becomes Closed or Cancelled and the reason is retained in the detail page and Audit Trail.

## UAT-CI-003: Convert Inquiry to Sales Order

Role: Sales or Manager

Steps:
1. Open an Open inquiry where every item has a Product match and Agreed Unit Price.
2. Select Convert to Sales Order.
3. Confirm customer, item rows, quantities, and agreed prices are filled automatically.
4. Complete and save the Sales Order.

Expected result: The Sales Order is created with the copied data and inquiry status becomes Converted to SO only after the order is saved.

## UAT-CI-004: Convert Inquiry to Customer PO / PO

Role: Sales or Manager

Steps:
1. Open an Open inquiry where every item has a Product match and Agreed Unit Price.
2. Select Convert to Customer PO.
3. Confirm customer and item data are filled automatically.
4. Enter required date, attach the required PO document, then save the Customer PO.

Expected result: The Customer PO receives a Sales Order Number and separate Customer PO Number, and inquiry status becomes Converted to Customer PO only after the order is saved. When Sales creates it for a customer with late-payment risk, it appears as Pending in Need Approval and cannot generate an invoice.

## UAT-CI-004A: Manager Reviews a Risky Customer PO

Role: Manager

Steps:
1. Open Customer Purchase Orders and select Need Approval.
2. Open a Pending Customer PO and review its customer, payment risk, required date, document, product pricing, total, and payment terms.
3. Select Reject without entering a confirmation reason and verify submission is blocked.
4. Cancel the dialog, then select Approve and submit an optional approval note.
5. Open Invoices and locate the generated invoice.

Expected result: Rejection always requires a reason. Approval changes the Customer PO to Approved/Invoiced and creates exactly one connected invoice. A decision already claimed by another Manager cannot be overwritten.

## UAT-CI-005: Delivered Order Completes Inquiry

Role: Admin or Manager

Steps:
1. Complete the invoice and delivery process for an inquiry-linked Sales Order or Customer PO.
2. Open the linked Surat Jalan.
3. Update its status to Delivered.
4. Open the originating Customer Inquiry.

Expected result: The inquiry status becomes Done and its status note records that the linked delivery was completed.

## UAT-DEPLOY-001: Vercel Deployment Uses Supabase Variables

Role: Project Owner

Steps:
1. Open the Vercel project.
2. Open Settings, then Environment Variables.
3. Confirm `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_CUSTOMER_PO_BUCKET` are filled.
4. Redeploy the latest GitHub commit.
5. Open the deployed URL.

Expected result: Vercel build finishes with Ready status and the deployed application can open the login page.
