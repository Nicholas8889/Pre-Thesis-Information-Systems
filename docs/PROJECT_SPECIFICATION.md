# CV Tajuk Revenue Cycle Information System

## Project specification — System / internal pilot

### 1. Purpose

CV Tajuk Revenue Cycle Information System is a web application for managing the company's revenue-cycle operations from a customer inquiry through order fulfilment, invoicing, payment collection, and delivery documentation.

The system replaces disconnected manual records with linked operational data. It is intended for a controlled internal pilot and thesis demonstration, with a clear path to a production rollout after security, migration, and operational-readiness work.

### 2. User roles

| Role | Primary responsibility | Key permissions |
|---|---|---|
| Sales | Customer-facing sales operations | Manage customer inquiries and create Sales Orders / Customer POs. |
| Admin | Financial and delivery operations | Create invoices, record payments, create Surat Jalan, and manage user accounts. |
| Manager | Operational oversight and approval | All operational permissions, including approval/rejection of orders requiring approval. |

The application shows restricted actions as disabled with an explanatory message. Audit Trail entries are system generated; they are not manually created by normal users.

### 3. Functional scope

| Module | Included capability |
|---|---|
| Dashboard | Revenue-cycle KPIs, payment-term summaries, recent records, delivery and collection insight. |
| Customer management | Create, view, edit, search, and activate/deactivate customer records, including NPWP, contacts, address, segment, and notes. |
| Product management | Create, view, edit, search, and activate/deactivate products with list price and notes. |
| Customer Inquiry | Record inquiries and items, then convert an inquiry into a direct Sales Order or Customer PO-backed Sales Order. |
| Sales Orders | Manage direct and Customer PO-backed orders, items, pricing, discounts, markup, PPN, payment terms, approval status, and order status. |
| Customer Purchase Orders | Capture Customer PO number, required date, and attached PO document; reuse the connected Sales Order workflow. |
| Invoice | Generate one invoice per eligible Sales Order; view, print, and track tax, payment term, due date, paid amount, remaining amount, and status. |
| Payment | Record Cash, Bank Transfer, or Other payments against invoices; calculate Partial and Paid status automatically. |
| Surat Jalan | Create, issue, deliver, and print a delivery note with recipient, driver, vehicle, items, receiver, and signature information. |
| Receivables | Display invoices with outstanding balances, due dates, payment status, and collection actions. |
| Collections | Create and complete planned collection tasks connected to a customer and optionally an invoice. |
| Customer Outreach | Record non-collection customer contact history. |
| Audit Trail | Record actor, role, module, entity, record reference, action, summary, and change data. |
| User management | Admin/Manager account creation with Admin, Sales, and Manager roles. |
| Reporting and documents | Export Sales Orders to Excel; retrieve Customer PO attachments; print Invoice and Surat Jalan layouts. |

### 4. Core business rules

1. A Customer Inquiry may be converted to either a direct Sales Order or a Customer PO-backed Sales Order.
2. A Sales Order stores its source, items, price calculations, PPN snapshot, payment terms, and approval decision.
3. One Sales Order can generate only one Invoice.
4. Invoice tax and NPWP values are snapshots from the order/customer data at the time of invoicing.
5. Immediate-payment invoices are due immediately; picking and delivery may proceed before full payment, subject to order approval and completed packing.
6. Credit invoices use the selected credit period (one to twelve months); Surat Jalan can be created after invoice generation without waiting for full payment.
7. Payments update paid amount, remaining amount, and invoice status.
8. Receivables are derived from invoices with a remaining balance; users do not manually create them.
9. A Collection Task can start from a receivable so its customer and invoice are preselected.
10. A Surat Jalan can start from an invoice so customer and item data are copied forward.
11. Risky Sales Orders require a Manager approval decision before they proceed through restricted steps.

### 5. Data model

Primary entities are User, Customer, Product, Customer Inquiry, Customer Inquiry Item, Sales Order, Sales Order Item, Invoice, Payment, Delivery Note, Delivery Note Item, Collection Task, Customer Outreach, and Audit Trail.

Important relationships:

```text
Customer Inquiry → Sales Order → Invoice → Payment
                                   ├── Receivable (derived from remaining balance)
                                   ├── Collection Task
                                   └── Surat Jalan → Surat Jalan Items

Customer ────────────────────────┘
Product → Sales Order Items / Customer Inquiry Items
```

### 6. User-interface specification

| Item | Specification |
|---|---|
| Font | Inter, with system-font fallbacks. |
| Desktop navigation | Fixed left sidebar, 288px wide; visible at 1024px and above. |
| Primary theme | Brand teal `#1F5F6F`. |
| Supporting theme | Accent blue-teal `#448191`. |
| Role badges | Primary teal background with white uppercase text. |
| Base form input | 42px height, 14px text, medium label weight. |
| Standard action button | 40px height, 14px semibold text. |
| Table action button | 36px height, 14px medium text. |
| Status badge | 24px height, 12px semibold text, flat fill without border. |
| Process tabs | 46px outer height; 36px individual tabs. |
| Desktop table search | 320px × 36px; Reset control is 36px high. |

The visual hierarchy uses 24px page titles, 20px section titles, 16px emphasized values, 14px standard body/controls, 12px metadata, and 10px micro-labels.

### 7. Technical architecture

| Layer | Technology |
|---|---|
| Web framework | Next.js 16 with React 19 and TypeScript |
| Styling | Tailwind CSS with central color tokens |
| Application data access | Prisma ORM |
| Database | PostgreSQL on Supabase |
| File storage | Private Supabase Storage bucket for Customer PO documents |
| Authentication | Server-side login actions, password hashing with bcryptjs, and application roles |
| Reporting | ExcelJS for Sales Order exports |
| Icons | Lucide React |
| Testing | Vitest, ESLint, TypeScript checking, and production builds |

### 8. Deployment specification

```text
GitHub repository → Vercel application → Supabase PostgreSQL + Supabase Storage
```

Required deployment configuration:

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CUSTOMER_PO_BUCKET`

The release build runs Prisma Client generation before the Next.js production build. Database schema changes are delivered through Prisma migrations.

### 9. Quality and acceptance criteria

The internal-pilot release is acceptable when:

1. Admin, Sales, and Manager users can log in and see the correct role label.
2. Role-restricted actions cannot be completed by an unauthorized role.
3. The full linked workflow—Inquiry/Customer PO → Sales Order → Invoice → Payment → Surat Jalan → Receivable → Collection Task—works with correct totals and statuses.
4. Immediate Payment and Credit share shipment eligibility: an approved order, active invoice, and completed packing are required; full payment is not required.
5. Invoice and Surat Jalan print views contain the required operational information.
6. Sales Order exports download as an Excel workbook, and Customer PO attachments remain access controlled.
7. Audit records preserve the user, role, action, module, and record reference.
8. Lint, automated tests, database migrations, and production build pass in the release environment.

### 10. System boundaries and excluded scope

This system is not yet a full ERP or production-grade enterprise platform. The current system excludes:

- Payment gateway, bank, ERP, accounting/general-ledger, e-commerce, or external API integrations.
- Inventory, stock movement, warehouse, courier-tracking, and procurement management.
- Production-grade authentication, complete page-level access isolation, SSO, MFA, and enterprise identity management.
- Formal backup/restore process, monitoring/alerting, disaster recovery, and service-level agreement.
- Legacy data migration, user training, change-management programme, and formal UAT sign-off.

### 11. Recommended production-readiness phase

Before a live company rollout, complete the following as a separate implementation phase:

1. Security review, stronger authentication, complete authorization enforcement, and audit review.
2. Production database setup, backup/restore testing, monitoring, alerts, and environment separation.
3. Company data cleansing and migration from existing spreadsheets or systems.
4. Real-user UAT, training material, workflow sign-off, and support process.
5. Any required accounting, inventory, bank, courier, or ERP integrations.

