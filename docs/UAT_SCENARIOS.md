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

Expected result: The sales order appears with correct subtotal and total. If the customer is clean, the order is confirmed and ready for Admin or Manager invoice generation. If the customer has outstanding payments, the order waits for Manager approval.

## UAT-003: Admin Generates an Invoice

Role: Admin

Steps:
1. Open Sales Orders.
2. Open an eligible confirmed sales order without an invoice.
3. Select Generate Invoice.
4. Review issue date, due date, payment terms, customer, sales order number, item rows, and invoice total.

Expected result: The invoice total matches the sales order total, the payment terms are copied, the due date follows Immediate Payment or Credit rules, and no customer/order/item data must be retyped.

## UAT-TERM-001: Immediate Payment Flow Allows Surat Jalan Before Full Payment

Role: Admin

Steps:
1. Create a Sales Order with Payment Terms = Immediate Payment.
2. Confirm and generate invoice.
3. Open the generated invoice.
4. Confirm due date is the same as issue date.
5. Create and complete a Picking List, then issue Surat Jalan before payment.
6. Confirm the invoice remains unpaid; mark Surat Jalan Delivered and check customer outstanding.
7. Record partial then full payment and verify the balance decreases. Repeat for a Customer PO.

Expected result: Immediate Payment and Credit use the same picking and shipment eligibility. Full payment is not required; approval, active invoice, and completed packing remain required.

## UAT-TERM-002: Credit Flow Allows Surat Jalan Before Payment

Role: Admin

Steps:
1. Create a Sales Order with Payment Terms = Credit.
2. Choose Credit Term = 3 months.
3. Confirm and generate invoice.
4. Confirm due date is 3 months after issue date.
5. Create and complete a Picking List, then issue Surat Jalan before payment.
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

## UAT-SJ-001: Admin Completes Warehouse Fulfillment

1. Open Picking List & Surat Jalan, tab Picking & Packing.
2. Select Add Picking List and choose an eligible SO/Customer PO.
3. Print the worksheet, save picked/packed quantities, picker, packer, and package count.
4. Mark Packed. Confirm the record stays in the first tab.
5. Create Surat Jalan, choose driver and plate, and issue it.
6. Confirm it appears in Surat Jalan Open; mark Delivered and confirm it moves to Completed.

Expected: one connected process, quantities copied from verified packing, and customer outstanding starts only on Delivered if an invoice balance remains.

## UAT-SJ-002: Picking Cannot Be Bypassed

1. Try unpaid and partially paid Immediate Payment orders: both appear in the picking queue when approved and invoiced.
2. Use either an Immediate Payment or Credit order, create a Picking List, and save a short packed quantity.
3. Try Mark Packed; verify it is rejected and no Surat Jalan is created.
4. Complete all quantities and required staff/package fields, then mark Packed.
5. Attempt to issue another Surat Jalan for the same list or reopen a Delivered document.

Expected: shortages stay in picking; duplicate deliveries and terminal-status reversals are blocked. Cancelled records appear only in their labelled archive and do not increase the Completed count.

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

Expected result: The Customer PO receives a Sales Order Number and separate Customer PO Number, and inquiry status becomes Converted to Customer PO only after the order is saved. When Sales creates it for a customer with outstanding payments, it appears as Pending in Need Approval and cannot generate an invoice.

## UAT-CI-004A: Manager Reviews a Risky Customer PO

Role: Manager

Steps:
1. Open Customer Purchase Orders and select Need Approval.
2. Open a Pending Customer PO and review its customer, approval reason, required date, document, product pricing, total, and payment terms.
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


## Customer Payment Status and Outstanding Amount

1. Open a customer with no qualifying delivered invoices; confirm Payment Status is Clean, the customer outstanding amount is Rp0, and open invoice count is zero.
2. Generate a Credit invoice for Rp1.850.000 with a future due date. Before creating a Surat Jalan, confirm the customer remains Clean even though the invoice is Unpaid.
3. Create a Surat Jalan in Issued status. Confirm the customer still shows Clean and Rp0 outstanding.
4. Change the Surat Jalan to Delivered. Confirm Outstanding Payment, Rp1.850.000, and one linked open invoice appear in customer detail.
5. Record Rp850.000; confirm the customer still has Outstanding Payment and Rp1.000.000 remaining. Record the final Rp1.000.000 and confirm Clean, Rp0, and no outstanding invoice links.
6. Create two unpaid invoices, but mark a Surat Jalan for only one invoice Delivered. Confirm only that invoice contributes to the amount and invoice count. Deliver the other shipment and confirm both invoices contribute.
7. Add another Delivered Surat Jalan for the same invoice. Confirm the full invoice remaining balance is still counted once; no proportional shipment calculation is applied.
8. Verify a Delivered Surat Jalan linked only to the Sales Order also qualifies its invoice. An unrelated order's Surat Jalan must not qualify the invoice.
9. Revert or cancel the only Delivered Surat Jalan for an unpaid invoice; confirm that invoice stops contributing. If another related Surat Jalan is still Delivered, the invoice must continue to contribute. Cancel the invoice itself and confirm it is excluded.
10. Pay an invoice fully before delivery, then mark its Surat Jalan Delivered. Confirm the customer stays Clean.
11. Confirm Customer Segment remains editable and Active/Inactive can be changed independently of payment status.
12. As Sales, create an order before the customer's existing unpaid invoice has a Delivered Surat Jalan; confirm no approval is needed from that invoice. Repeat after Delivered and confirm Manager approval is required.

Expected result: Customer Payment Status, amount, invoice count, order insight, and new Sales approval decisions use remaining balances only after a related Surat Jalan is Delivered. Invoice due dates, invoice payment status, and Receivables continue to follow their existing rules. No invoice without Delivered evidence qualifies for customer outstanding.
