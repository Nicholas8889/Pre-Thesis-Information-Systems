# Role-Based Access Regression Test Report

Date: 20 June 2026

## Result

PASS - No application defects were found in the role-based limitation regression pass.

## Automated Validation

| Check | Result |
|---|---|
| Unit test files | 7 passed |
| Unit tests | 41 passed |
| Role-access rule tests | 3 passed |
| ESLint | Passed with zero warnings |
| TypeScript type-check | Passed |
| Production build | Passed |
| Prisma migrations | 8 found; database schema up to date |

## Authenticated Route Smoke Test

All main application pages were requested with authenticated Admin, Sales, and Manager sessions.

- Routes checked per role: 11
- Total authenticated requests: 33
- Passed: 33
- Failed: 0

Routes checked:

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

## Role UI Matrix

| Role | Capability checked | Result |
|---|---|---|
| Manager | Create Sales Order controls enabled | Passed |
| Manager | Need Approval tab visible | Passed |
| Manager | Top 5 Popular Products insight visible | Passed |
| Manager | No Manager create-order restriction rendered | Passed |
| Sales | Create Sales Order form enabled | Passed |
| Sales | Record Payment form disabled | Passed |
| Sales | Payment restriction tooltip text rendered | Passed |
| Sales | Create Surat Jalan form disabled | Passed |
| Sales | Surat Jalan restriction tooltip text rendered | Passed |
| Sales | Create Account form disabled | Passed |
| Sales | Account restriction tooltip text rendered | Passed |
| Admin | Create Sales Order form disabled | Passed |
| Admin | Sales Order restriction tooltip text rendered | Passed |
| Admin | Record Payment form enabled | Passed |
| Admin | Create Surat Jalan form enabled | Passed |
| Admin | Create Account form enabled | Passed |
| Admin | Audit Trail read-only notice visible | Passed |

## Workflow and Security Checks

- Manager is allowed every configured capability.
- Sales is blocked from Invoice, Payment, Surat Jalan, and account creation.
- Admin is blocked from Sales Order creation.
- Audit Trail records remain system-generated and read-only.
- Restricted fields and buttons remain visible in a disabled state.
- Restricted controls include role-specific hover tooltip text.
- Server actions repeat the capability checks to prevent direct form bypass.
- Clean Sales-created orders stop at Confirmed for Admin or Manager invoicing.
- Risky Sales-created orders remain in Pending approval until Manager action.
- Pending and rejected orders cannot bypass Invoice approval rules.

## UI Test Note

The in-app browser automation connection was unavailable because the Windows browser worker could not start under the current process permissions. The rendered UI was therefore verified through live authenticated HTTP responses, including disabled fieldset attributes, tooltip content, role-specific buttons, tabs, and dashboard sections.
