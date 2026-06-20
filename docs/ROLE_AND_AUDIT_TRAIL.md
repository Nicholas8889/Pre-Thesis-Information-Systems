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

All roles can currently access every page. Role is used as account identity and audit information only.

The app does not hide menus or block routes by role yet. Role-based restrictions can be added later if the thesis scope needs it.

## Demo Accounts

| Username | Display Name | Role | Status | Demo Password |
| --- | --- | --- | --- | --- |
| `admin` | Admin Demo | Admin | Active | `Admin123!` |
| `sales` | Sales Demo | Sales | Active | `Sales123!` |
| `manager` | Manager Demo | Manager | Active | `Manager123!` |

Passwords are stored with the existing local password hashing helper.

## Audit Trail Purpose

The Audit Trail page is a centralized record of important data changes. It shows who made the change, what module was changed, which transaction code was affected, and the exact date/time of the change.

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
- `transactionCode`
- `action`
- `changeSummary`
- `oldValue`
- `newValue`
- `createdAt`

`oldValue` and `newValue` are stored as readable text/JSON strings for SQLite simplicity.

## Logged Actions

Current logging covers:

- Customers: created, updated, status changed
- Sales Orders: created, status changed when invoice is generated separately
- Invoices: created/generated, notes updated, status changed after payment
- Payments: payment recorded
- Surat Jalan: created, status changed, delivered
- Receivables: created from invoice, updated after payment, closed when fully paid
- Follow-ups: created, including automatic credit follow-ups
- Settings / Accounts: account created

Seed data also creates a few demo audit records for presentation.

## Limitations

This is intentionally simple for the local thesis MVP:

- Roles do not restrict access yet.
- Existing pages do not have per-module history pages.
- Audit logging focuses on current major create/update/status flows.
- Account editing and password reset flows are not currently implemented, so only account creation is logged from Settings.
- Receivables are derived from invoices, so receivable audit entries use the related invoice id and invoice number.
- System-generated updates may use `System` if no logged-in user session is available.
