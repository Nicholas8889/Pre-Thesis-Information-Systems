# ERD Notes - CV Tajuk Revenue Cycle Information System

Updated: 18 July 2026

## Active Entities

The active Prisma schema contains User, AuditTrail, Customer, CustomerInquiry, CustomerInquiryItem, Product, SalesOrder, SalesOrderItem, Invoice, Payment, CollectionTask, CustomerOutreach, DeliveryNote, and DeliveryNoteItem.

All physical PostgreSQL identifiers use lowercase snake_case. Prisma `@map` and `@@map` metadata preserve the canonical camelCase domain API, and every table uses an `id` primary-key column.

## Revenue-Cycle Structure

```text
Customer
  -> CustomerInquiry -> CustomerInquiryItem
  -> SalesOrder -> SalesOrderItem
  -> Invoice -> Payment
             -> CollectionTask (Collections)
  -> CustomerOutreach
  -> DeliveryNote -> DeliveryNoteItem
```

- A Sales Order can generate at most one Invoice.
- A Customer Inquiry can contain one or more requested item lines. It can be Closed, Cancelled, converted to a Sales Order or Customer PO, then marked Done after the linked Delivery Note is Delivered.
- An inquiry item may reference a Product. Every item needs a product match and Agreed Unit Price before conversion is available.
- A Customer PO is a SalesOrder with order source `CUSTOMER_PO`, an independent Customer PO Number, required date, and PO document metadata.
- Payments reduce the Invoice remaining amount.
- Receivable is derived from Invoice and is not a physical table.
- CollectionTask represents payment collection work and may link to an Invoice.
- CustomerOutreach represents sales relationship/contact work.
- DeliveryNote represents Surat Jalan and may link to a Sales Order and/or Invoice.
- AuditTrail stores the actor, Record Reference, action, confirmation note, and old/new values.

## Sales Order Deletion

An Admin or Manager can delete an eligible ongoing Sales Order after entering a mandatory confirmation note. The application removes the connected Delivery Notes and items, Collection Tasks, Payments, Invoice, Sales Order Items, and Sales Order in one database transaction. The Customer remains, and AuditTrail retains evidence of the deletion. Paid, delivered, or cancelled chains cannot be deleted.

## System Design Notes

- Monetary values are whole-Rupiah integers.
- User trace fields on SalesOrder and AuditTrail are not declared as physical Prisma relations in this system.
- `HistoryLog` is retained as a legacy physical table from an earlier migration, but current application activity uses AuditTrail.
