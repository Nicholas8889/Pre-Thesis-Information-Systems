# ERD - CV Tajuk Revenue Cycle Information System

Updated: 18 July 2026

This ERD uses the canonical Prisma domain API. The physical PostgreSQL schema uses lowercase snake_case table, column, enum-type, constraint, and index identifiers through explicit Prisma `@map`/`@@map` metadata; every primary key is `id`.

## Mermaid ERD

```mermaid
erDiagram
  USER {
    String id PK
    String username UK
    String passwordHash
    String displayName
    UserRole role
    UserStatus status
    DateTime createdAt
    DateTime updatedAt
  }

  AUDIT_TRAIL {
    String id PK
    String actorUserId
    String actorUsername
    String actorDisplayName
    String actorRole
    String moduleName
    String entityType
    String entityId
    String recordReference
    String action
    String changeSummary
    String actionNote
    String oldValue
    String newValue
    DateTime createdAt
  }

  CUSTOMER {
    String id PK
    String name
    String companyName
    String npwp UK
    String phone
    String email
    String address
    String customerSegment
    CustomerStatus status
    String notes
    DateTime createdAt
    DateTime updatedAt
  }

  PRODUCT {
    String id PK
    String productName
    String notes
    Int listPrice
    ProductStatus status
    DateTime createdAt
    DateTime updatedAt
  }

  SALES_ORDER {
    String id PK
    String orderNumber UK
    String customerPoNumber UK
    SalesOrderSource source
    DateTime requiredDate
    String customerPoDocumentName
    String customerPoDocumentStoredName
    String customerPoDocumentMimeType
    String customerId FK
    DateTime orderDate
    SalesOrderStatus status
    Int subtotal
    Int total
    PaymentTermType paymentTermType
    Int creditTermMonths
    String notes
    SalesOrderApprovalStatus approvalStatus
    String approvalRisk
    String approvalDecisionNote
    DateTime approvalDecidedAt
    String approvalDecidedById
    String createdByUserId
    DateTime createdAt
    DateTime updatedAt
  }

  SALES_ORDER_ITEM {
    String id PK
    String salesOrderId FK
    String productId FK
    String itemName
    Int quantity
    Int baseUnitPrice
    Int markupPercent
    Int discountPercent
    Int finalUnitPrice
    Int subtotal
  }

  CUSTOMER_INQUIRY {
    String id PK
    String inquiryNumber UK
    String customerId FK
    DateTime inquiryDate
    DateTime neededBy
    CustomerInquiryStatus status
    String notes
    String statusNote
    String salesOrderId FK UK
    DateTime createdAt
    DateTime updatedAt
  }

  CUSTOMER_INQUIRY_ITEM {
    String id PK
    String customerInquiryId FK
    String productId FK
    String itemName
    Int quantity
    Int requestedUnitPrice
    Int agreedUnitPrice
    String notes
  }

  INVOICE {
    String id PK
    String invoiceNumber UK
    String salesOrderId FK
    String customerId FK
    DateTime issueDate
    DateTime dueDate
    Int totalAmount
    Int paidAmount
    Int remainingAmount
    PaymentTermType paymentTermType
    Int creditTermMonths
    InvoiceStatus status
    String notes
    DateTime createdAt
    DateTime updatedAt
  }

  PAYMENT {
    String id PK
    String invoiceId FK
    DateTime paymentDate
    Int amount
    PaymentMethod paymentMethod
    String notes
    DateTime createdAt
    DateTime updatedAt
  }

  COLLECTION_TASK {
    String id PK
    String customerId FK
    String invoiceId FK
    DateTime scheduledDate
    CollectionTaskStatus status
    String notes
    DateTime createdAt
    DateTime updatedAt
  }

  CUSTOMER_OUTREACH {
    String id PK
    String customerId FK
    DateTime contactDate
    String notes
    DateTime createdAt
    DateTime updatedAt
  }

  DELIVERY_NOTE {
    String id PK
    String deliveryNoteNumber UK
    String invoiceId FK
    String salesOrderId FK
    String customerId FK
    String recipientName
    String recipientPhone
    String recipientAddress
    DateTime deliveryDate
    DeliveryNoteStatus status
    String notes
    String receiverName
    String senderName
    String authorizedBy
    DateTime createdAt
    DateTime updatedAt
  }

  DELIVERY_NOTE_ITEM {
    String id PK
    String deliveryNoteId FK
    String productCode
    String itemName
    Int quantity
    String unit
    String description
  }

  CUSTOMER ||--o{ SALES_ORDER : places
  CUSTOMER ||--o{ CUSTOMER_INQUIRY : makes
  PRODUCT ||--o{ SALES_ORDER_ITEM : may_match
  CUSTOMER_INQUIRY ||--|{ CUSTOMER_INQUIRY_ITEM : contains
  PRODUCT o|--o{ CUSTOMER_INQUIRY_ITEM : may_match
  CUSTOMER_INQUIRY o|--o| SALES_ORDER : converts_to
  SALES_ORDER ||--|{ SALES_ORDER_ITEM : contains
  SALES_ORDER ||--o| INVOICE : generates
  CUSTOMER ||--o{ INVOICE : receives
  INVOICE ||--o{ PAYMENT : has
  CUSTOMER ||--o{ COLLECTION_TASK : has_collection
  INVOICE ||--o{ COLLECTION_TASK : may_have
  CUSTOMER ||--o{ CUSTOMER_OUTREACH : has_contact
  CUSTOMER ||--o{ DELIVERY_NOTE : receives
  SALES_ORDER ||--o{ DELIVERY_NOTE : may_support
  INVOICE ||--o{ DELIVERY_NOTE : may_support
  DELIVERY_NOTE ||--|{ DELIVERY_NOTE_ITEM : contains
```

## Entity Summary

| Entity | Primary key | Purpose |
| --- | --- | --- |
| User | `id` | Local account, role, login status, and authorization identity. |
| AuditTrail | `id` | Immutable activity evidence including actor, action, confirmation note, and old/new values. |
| Customer | `id` | Customer master data, active/inactive state, and notes. |
| CustomerInquiry | `id` | Customer request with lifecycle status before it becomes an order or is closed/cancelled. |
| CustomerInquiryItem | `id` | Requested product line, quantity, Requested/Agreed Unit Prices, and optional product match. |
| SalesOrder | `id` | Revenue-cycle starting document, payment terms, totals, approval state, and notes. |
| SalesOrderItem | `id` | Product or service lines belonging to a Sales Order. |
| Invoice | `id` | Amount-due document generated from one Sales Order. |
| Payment | `id` | Partial or full payment recorded against an Invoice. |
| CollectionTask | `id` | Payment collection task linked to a Customer and optionally an Invoice. |
| CustomerOutreach | `id` | Product/contact activity for maintaining the customer relationship. |
| DeliveryNote | `id` | Surat Jalan header linked to a Customer and optionally an Invoice/Sales Order. |
| DeliveryNoteItem | `id` | Product lines contained in a Surat Jalan. |

## Relationship and Deletion Rules

- One Customer can have many Sales Orders, Invoices, Collection Tasks, Customer Outreach records, and Delivery Notes.
- One Customer can have many Customer Inquiries. One Customer Inquiry has one or more Customer Inquiry Items and can link to at most one Sales Order/Customer PO.
- A Customer Inquiry Item can optionally match a Product. The product match and Agreed Unit Price are required before conversion.
- One Sales Order contains many Sales Order Items and can generate at most one Invoice.
- One Invoice can have many Payments, Collection Tasks, and Delivery Notes.
- One Delivery Note contains many Delivery Note Items.
- Sales Order Items, Payments, Customer Outreach records, and Delivery Note Items use cascade behavior where configured in Prisma.
- Deleting an eligible ongoing Sales Order is an application transaction that explicitly removes its Delivery Notes, Collection Tasks, Payments, Invoice, Sales Order Items, and Sales Order. The Customer and Audit Trail remain.
- Paid, delivered, or cancelled order chains are protected from Sales Order deletion.
- When a linked Delivery Note is marked Delivered, a Customer Inquiry converted to a Sales Order or Customer PO becomes Done.

## Logical Concepts

- Receivable is derived from `Invoice.remainingAmount`, `Invoice.status`, and `Invoice.dueDate`; there is no separate Receivable table.
- Dashboard values and charts are calculated from operational entities and do not require a Dashboard table.
- `actorUserId`, `createdByUserId`, and `approvalDecidedById` are stored as trace values but are not declared as Prisma foreign-key relations in the current MVP.
- A Customer PO uses the SalesOrder table with order source `CUSTOMER_PO`; it adds an independent Customer PO Number, required date, and PO document metadata.
- Audit Trail records retain deletion evidence and the required deletion confirmation note after the operational record has been removed.

## Naming Notes

- Physical attributes use camelCase.
- Every active table uses a descriptive camelCase primary key beginning with `id`.
- `HistoryLog` is a legacy physical table retained by earlier migrations; the active application uses `AuditTrail` instead.
