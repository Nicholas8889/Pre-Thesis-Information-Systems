# ERD Notes - CV Tajuk Revenue Cycle Information System

Updated: 22 June 2026

## Active Entities

The active Prisma schema contains User, AuditTrail, Customer, SalesOrder, SalesOrderItem, Invoice, Payment, FollowUp, CustomerProductFollowUp, DeliveryNote, and DeliveryNoteItem.

All physical database attributes use camelCase. Each table has a descriptive primary key beginning with `id`, such as `idCustomer`, `idSalesOrder`, and `idDeliveryNoteItem`. Prisma field mappings preserve the application-facing `id` API.

## Revenue-Cycle Structure

```text
Customer
  -> SalesOrder -> SalesOrderItem
  -> Invoice -> Payment
             -> FollowUp (Billing)
  -> CustomerProductFollowUp
  -> DeliveryNote -> DeliveryNoteItem
```

- A Sales Order can generate at most one Invoice.
- Payments reduce the Invoice remaining amount.
- Receivable is derived from Invoice and is not a physical table.
- FollowUp represents billing/collection work and may link to an Invoice.
- CustomerProductFollowUp represents sales relationship/contact work.
- DeliveryNote represents Surat Jalan and may link to a Sales Order and/or Invoice.
- AuditTrail stores the actor, transaction, action, confirmation note, and old/new values.

## Sales Order Deletion

An Admin or Manager can delete an eligible ongoing Sales Order after entering a mandatory confirmation note. The application removes the connected Delivery Notes and items, Billing Follow-ups, Payments, Invoice, Sales Order Items, and Sales Order in one database transaction. The Customer remains, and AuditTrail retains evidence of the deletion. Paid, delivered, or cancelled chains cannot be deleted.

## MVP Design Notes

- Monetary values are whole-Rupiah integers.
- User trace fields on SalesOrder and AuditTrail are not declared as physical Prisma relations in this MVP.
- `HistoryLog` is retained as a legacy physical table from an earlier migration, but current application activity uses AuditTrail.
