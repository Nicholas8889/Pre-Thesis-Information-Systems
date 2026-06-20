# Page Standardization Notes

This document explains the operational page structure used in the current CV Tajuk Revenue Cycle Information System MVP.

The purpose is to keep each page simple, consistent, and easy to explain during thesis demonstration. The Invoice page is used as the main reference because it already follows the clearest MVP structure: page title, short purpose text, process tabs where needed, detail area where useful, and one main list/table for records.

## Standard Page Pattern

Operational pages should follow this order:

1. `PageHeader`
   - Shows the module name.
   - Uses one short description that explains the business purpose.
   - Shows the main action button only when the page needs an action in that process state.

2. Optional summary or form area
   - Used only when it helps the user complete the page's main task.
   - Examples: create Sales Order, record Payment, add Follow-up, or view a selected document.

3. Process tabs where applicable
   - Ongoing Process is for active work and operational actions.
   - Done Process is for completed or closed records.
   - Done Process should stay mostly list-only, so completed records are easy to review without extra operational controls.

4. Main table/list card
   - Shows the primary records for the module.
   - Uses consistent table spacing, status badges, action placement, and empty states.
   - Table rows use a light hover state so the list feels clickable and easier to scan.

5. Empty state
   - If no record exists, show a short message that tells the user what is missing.

## Pages Standardized

### Customers

Customers use the standard header, optional add/edit form, optional selected customer detail, and a main customer table.

The page remains focused on customer master data, because customer data is reused by Sales Orders, Invoices, Payments, Receivables, and Follow-ups.

### Sales Orders

Sales Orders use the standard header, Ongoing/Done Process tabs, optional create form, optional selected order detail, and a main sales order table.

Ongoing Sales Orders keep operational actions such as creating a sales order and generating an invoice. Done Sales Orders remain list-focused for review.

### Invoices

Invoices are the reference page for this standard. The page uses Ongoing/Done Process tabs, invoice detail, printable invoice access, delivery-note action where allowed, and a main invoice table.

### Payments

Payments use the standard header, Payment Queue card, Record Payment form, and Recorded Payments table.

The Payment Queue remains separate because it represents invoices that still need payment. This keeps the user flow easy to understand: open invoice first, then record payment.

### Surat Jalan

Surat Jalan uses the standard header, Ongoing/Done Process tabs, optional create form, optional selected delivery note detail, and a main delivery note table.

Ongoing Surat Jalan keeps create, view, edit status, and print actions. Done Surat Jalan stays list-focused, with print access still available.

### Receivables

Receivables use the standard header, Ongoing/Done Process tabs, optional compact summary cards, status filters, and a main receivable table.

Ongoing Receivables show follow-up actions. Done Receivables are kept as closed review records.

### Follow-ups

Follow-ups use the standard header, Ongoing/Done Process tabs, optional add form, and a main follow-up table.

Ongoing Follow-ups allow new reminders to be created. Done Follow-ups are list-only so completed reminders are easy to review.

### Settings

Settings is a support page for local demo accounts. It keeps the account management form and existing account table, with light visual alignment only.

## Intentionally Not Changed

The Dashboard was not redesigned. It remains an overview page with KPI cards, charts, recent records, reminders, and module summary.

The database schema and business logic were not changed. This standardization only affects page presentation and documentation.

## History Feature Note

Operational History buttons and routes are not part of the current simple MVP page flow. The current operational pages should present normal revenue cycle work without separate History controls.

Old documentation or old migration records may still mention History for traceability, but the active page flow should stay focused on the main MVP modules.

## Simple Thesis Explanation

The MVP uses a consistent page layout so users can move through the revenue cycle without learning a different screen pattern each time.

The standard flow is:

Customer -> Sales Order -> Invoice -> Payment -> Surat Jalan -> Receivable -> Follow-up -> Dashboard monitoring

Each operational page shows the module purpose at the top, keeps active work in Ongoing Process, keeps finished records in Done Process, and uses consistent tables, statuses, and action buttons.
