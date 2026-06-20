# Whole Application Regression Test Report

Date: 20 June 2026

## Final Result

PASS - No blocking application defects were found.

## Automated Quality Checks

| Check | Result |
|---|---|
| Unit test files | 8 passed |
| Unit tests | 44 passed |
| ESLint | Passed with zero warnings |
| TypeScript type-check | Passed |
| Production build | Passed |
| Prisma migrations | 8 found; database schema up to date |

The unit suite covers calculations, process statuses, customer intelligence, notifications, product insights, Sales Order approval, role access, and table date/number/text sorting utilities.

## Authenticated Application Route Test

The 11 main authenticated routes were requested for Admin, Sales, and Manager.

- Total checks: 33
- Passed: 33
- Failed: 0

Routes tested:

- Dashboard
- Customers
- Sales Orders
- Invoices
- Payments
- Surat Jalan
- Receivables
- Billing
- Follow Up
- Audit Trail
- Settings

## Feature-Specific Regression Checks

| Feature | Result |
|---|---|
| Login page responds successfully | Passed |
| Password initially uses hidden password type | Passed |
| Show Password control and accessible label render | Passed |
| Record Contact link customer parameter loads | Passed |
| Requested customer is selected in Record Customer Contact | Passed |
| Table search enhancer included on non-print application pages | Passed |
| Sort utility handles text, numbers, currency, and dates | Passed |
| Tag filter configuration includes Category, Risk, Status, Invoice, Payment Term, Method, Role, Module, and similar fields | Passed |
| Date columns receive Start Date and End Date controls | Passed |
| Reset restores original table order and clears filters | Passed |
| Print routes are excluded from table controls | Passed |
| Role-restricted controls remain enforced | Passed |
| Manager approval workflow still compiles and passes rules | Passed |
| Notification rules still pass | Passed |

## Excel Export Check

- HTTP response: 200 OK
- Content type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Download filename: `sales-orders-2026-01-01-2026-12-31.xlsx`

## UI Automation Note

The in-app browser worker could not start under the current Windows process permissions. Live rendered HTML responses were used to verify autofill selection, password controls, authenticated pages, disabled role controls, and server-rendered content. Interactive table behavior is additionally covered by focused utility tests, lint, type-checking, and the production build.
