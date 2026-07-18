# CRUD Table - CV Tajuk Revenue Cycle MVP

Updated: 18 July 2026

This CRUD matrix maps the active application modules to the class names shown in the current class diagram. It is based on the current MVP scope: Customer -> CustomerInquiry -> SalesOrder / PreOrder -> Invoice -> DeliveryNote -> Payment -> FollowUp.

## Legend

| Code | Meaning |
| --- | --- |
| C | Create record |
| R | Read or view record |
| U | Update record, status, notes, totals, or derived balance |
| D | Delete record |
| C* | Created automatically as part of another workflow |
| D* | Deleted only when an eligible ongoing Sales Order is deleted |

## CRUD Matrix

| Module / Process | User | Customer | CustomerInquiry | CustomerInquiryItem | SalesOrder | PreOrder | SalesOrderItem | Product | FollowUp | Invoice | Payment | DeliveryNote | DeliveryNoteItem |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Login & Account Settings | C, R |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Dashboard & Notifications | R | R | R | R | R | R | R | R | R | R | R | R | R | R |
| Customer Management |  | C, R, U | R | R | R | R |  |  |  |  | R |  | R |  |
| Customer Inquiry Management |  | R | C, R, U | C, R | C* | C* | C* | R |  |  |  |  |  |
| Product Management |  |  |  | R |  |  | R | C, R, U |  |  |  |  |  |  |
| Sales Order Management |  | R | R, U* | R | C, R, U, D* |  | C, R, U, D* | R | C* | C* |  |  |  |
| Pre Order Management |  | R | R, U* | R | C, R, U, D* | C, R, U, D* | C, R, U, D* | R | C* | C* |  |  |  |
| Manager Approval |  | R | R | R | R, U | R, U | R |  | C* | C* |  |  |  |
| Invoice Management |  | R | R | R | R, U | R | R |  | C* | C, R, U, D* | R, D* |  |  |
| Payment Management |  | R | R |  | R | R |  |  |  | R, U | C, R, D* |  |  |
| DeliveryNote Management |  | R | U* |  | R | R | R |  |  | R |  | C, R, U, D* | C, R, U, D* |
| Receivable Monitoring |  | R, U* |  |  | R | R |  |  | C | R, U | R |  |  |
| FollowUp Management |  | R |  |  |  |  |  |  | C, R, U, D* | R |  |  |  |

## Notes

- `PreOrder` is represented as a specialization of `SalesOrder` in the class diagram. It adds `poNumber`, `requiredDate`, `poDocumentName`, `poDocumentStoredName`, and `poDocumentMimeType`.
- `CustomerInquiry` and `CustomerInquiryItem` record one or more requested items before an order is created. A saved Sales Order or Pre Order updates the inquiry to Converted to SO/PO; a Delivered Delivery Note updates it to Done.
- Receivable is not a separate class. It is derived from `Invoice.remainingAmount`, `Invoice.status`, and `Invoice.dueDate`.
- Sales Order deletion is limited to eligible ongoing transactions. The application deletes the related `SalesOrderItem`, `Invoice`, `Payment`, `FollowUp`, `DeliveryNote`, and `DeliveryNoteItem` records in one controlled workflow.
- `AuditTrail` exists in the application, but it is not included in this matrix because it is not shown in the provided class diagram.
- `Product` and `Customer` records use active/inactive status changes instead of hard delete in the current MVP.

## Generated Image

The image version is available at:

- `docs/diagrams/crud-table.png`
- `docs/diagrams/crud-table.svg`
