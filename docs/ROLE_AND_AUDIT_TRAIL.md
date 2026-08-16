# Role and Audit Trail

## Role List

The MVP uses three account roles:

- `ADMIN` - Admin
- `SALES` - Sales
- `MANAGER` - Manager

Older role values are mapped during migration:

- `GeneralManager` and `MN` become `MANAGER`
- `Staff` becomes `SALES`
- `Admin` becomes `ADMIN`
- `Sales` becomes `SALES`

## Access Behavior

All roles can open and review the main pages, but important operational actions are restricted by role.

Current behavior:

| Action Area | Manager | Admin | Sales |
| --- | :---: | :---: | :---: |
| View dashboards and operational modules | Yes | Yes | Yes |
| Manage customer records | Yes | Yes | Yes |
| Create Customer Inquiry | Yes | No | Yes |
| Create Sales Order or Customer PO | Yes | No | Yes |
| Delete eligible ongoing Sales Order | Yes | Yes | No |
| Approve or reject risky Sales Order | Yes | No | No |
| Generate Invoice | Yes | Yes | No |
| Record Payment | Yes | Yes | No |
| Create Surat Jalan | Yes | Yes | No |
| Manage Collections and Customer Outreach | Yes | Yes | Yes |
| Review Audit Trail | Yes | Yes | Yes |
| Create user account | Yes | Yes | No |

The MVP primarily uses action-level restriction. Some menus remain visible across roles so users can review related records during thesis demonstration.

## Demo Accounts

| Username | Display Name | Role | Status | Demo Password |
| --- | --- | --- | --- | --- |
| `admin` | Admin Demo | Admin | Active | `Admin123!` |
| `sales` | Sales Demo | Sales | Active | `Sales123!` |
| `manager` | Manager Demo | Manager | Active | `Manager123!` |

Passwords are stored with the existing local password hashing helper.

## Audit Trail Purpose

The Audit Trail page is a centralized record of important data changes. It shows who made the change, what module was changed, which record reference was affected, and the exact date/time of the change.

Route:

- `/audit-trail`

## Audit Trail Fields

The `AuditTrail` model stores:

- `id`
- `actorUserId`
- `actorUsername`
- `actorDisplayName`
- `actorRole`
- `moduleName`
- `entityType`
- `entityId`
- `recordReference`
- `action`
- `changeSummary`
- `oldValue`
- `newValue`
- `createdAt`

`oldValue` and `newValue` are stored as readable text/JSON strings for simple thesis evidence and review.

## Logged Actions

Current logging covers:

- Customers: created, updated, status changed
- Customer Inquiries: created, closed, cancelled, converted to Sales Order/Customer PO, and completed after delivery
- Sales Orders and Customer Purchase Orders: created, status changed, approval decisions, PO conversion, and deletion of eligible ongoing chains
- Invoices: created/generated, notes updated, status changed after payment
- Payments: payment recorded
- Surat Jalan: created, status changed, delivered
- Receivables: created from invoice, updated after payment, closed when fully paid
- Collections: Collection Task created, including automatic credit payment collection reminders
- Customer Outreach: customer product/contact activity recorded
- Settings / Accounts: account created

Seed data also creates a few demo audit records for presentation.

## Limitations

This is intentionally simple for the thesis MVP:

- Role control is action-level and not full page-level isolation.
- Existing pages do not have separate per-module history pages.
- Audit logging focuses on current major create/update/status flows.
- Account editing and password reset flows are not currently implemented, so only account creation is logged from Settings.
- Receivables are derived from invoices, so receivable audit entries use the related invoice id and invoice number.
- System-generated updates may use `System` if no logged-in user session is available.
- Demo accounts and role checks are suitable for thesis demonstration and controlled pilot review, but production rollout should review password policy, session hardening, and administrative controls.
