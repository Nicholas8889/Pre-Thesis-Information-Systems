# ERD Notes - CV Tajuk Revenue Cycle Information System

These notes explain the current MVP database structure in simple thesis-defense language. The information is based on the actual Prisma schema in `prisma/schema.prisma`.

## 1. List of Entities

The current Prisma schema contains these physical entities:

- User
- Customer
- SalesOrder
- SalesOrderItem
- Invoice
- Payment
- FollowUp
- DeliveryNote
- DeliveryNoteItem

There is no physical `Receivable` table in the current schema. Receivables are calculated from Invoice data.

## 2. Purpose of Each Entity

| Entity | Simple Purpose |
| --- | --- |
| User | Stores local demo accounts used for login and Settings account management. |
| Customer | Stores customer identity, company, contact, address, type, status, and notes. |
| SalesOrder | Stores the starting transaction document for the revenue cycle. It records customer, order date, status, payment term, subtotal, and total. |
| SalesOrderItem | Stores item/product rows inside a Sales Order. |
| Invoice | Stores the billing document generated from a Sales Order. It records issue date, due date, total, paid amount, remaining amount, payment term, and invoice status. |
| Payment | Stores each payment made against an Invoice. |
| FollowUp | Stores customer reminder activities. It is always linked to a Customer and can optionally link to an Invoice. |
| DeliveryNote | Stores Surat Jalan data, including recipient, delivery date, status, and optional links to Invoice and Sales Order. |
| DeliveryNoteItem | Stores item/product rows inside a Surat Jalan / Delivery Note. |

## 3. Physical Relationships Found in Prisma

The implemented database relationships are:

- Customer to SalesOrder: one Customer can have many Sales Orders.
- SalesOrder to SalesOrderItem: one Sales Order can contain many item rows.
- SalesOrder to Invoice: one Sales Order can have zero or one Invoice.
- Customer to Invoice: one Customer can have many Invoices.
- Invoice to Payment: one Invoice can have many Payment records.
- Customer to FollowUp: one Customer can have many Follow-up records.
- Invoice to FollowUp: one Invoice can have many Follow-up records, but the invoice link is optional.
- Customer to DeliveryNote: one Customer can have many Delivery Notes.
- SalesOrder to DeliveryNote: one Sales Order can have many Delivery Notes, but this link is optional on the Delivery Note.
- Invoice to DeliveryNote: one Invoice can have many Delivery Notes, but this link is optional on the Delivery Note.
- DeliveryNote to DeliveryNoteItem: one Delivery Note can contain many item rows.

The User entity currently has no physical relationship to transactions.

## 4. Logical / Business Relationships

Some relationships exist in the business process but are not separate physical tables:

- Receivable is a business concept derived from Invoice data. If an Invoice has `remainingAmount > 0` and a status such as Unpaid, Partial, or Overdue, the system treats it as an active receivable.
- Follow-up supports receivable collection when it is linked to an Invoice with remaining balance. However, because there is no physical Receivable table, the database relationship is `Invoice -> FollowUp`, not `Receivable -> FollowUp`.
- Dashboard information is calculated from Sales Orders, Invoices, Payments, Delivery Notes, and Follow-ups. There is no Dashboard table.
- Surat Jalan is represented by the `DeliveryNote` model.
- Payment term behavior is stored in SalesOrder and Invoice through `paymentTermType` and `creditTermMonths`.

## 5. MVP Schema Limitations

- There is no separate Receivable table. This keeps the MVP simpler because receivable values come directly from Invoice remaining amount.
- User accounts are not linked to created or updated transactions. This is acceptable for the local thesis MVP, but a production system might track who created each document.
- DeliveryNote can link to Invoice and SalesOrder optionally. This supports flexible demo flow, but production rules might enforce stricter requirements.
- Monetary values are stored as `Int`, suitable for whole Rupiah values in this MVP.
- There is no current HistoryLog or AuditLog model in the Prisma schema.

## 6. Simple Thesis Defense Explanation

The revenue cycle starts from the Customer and Sales Order. A Sales Order contains item rows and can generate one Invoice. The Invoice records the billing amount, due date, payment term, paid amount, remaining amount, and collection status. Payments reduce the Invoice remaining amount. If an Invoice still has a remaining balance, the application treats it as a Receivable. Follow-ups are used to remind customers about payment and can be connected to the related Invoice. Surat Jalan is implemented as DeliveryNote and contains delivery document information and delivery item rows.

In short:

Customer -> Sales Order -> Invoice -> Payment / Receivable -> Follow-up, with Surat Jalan / Delivery Note connected to the order or invoice when delivery is needed.
