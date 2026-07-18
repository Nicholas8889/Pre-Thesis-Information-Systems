# Last Changes Test Report

## 1. Testing Date

- Date: 14 June 2026
- Project folder: `D:\Pre Thesis MVP Iterative Development`
- Purpose: Stability testing for recent MVP changes before continuing thesis demo/testing.

## 2. Pre-Test Checks

- [x] Active folder verified as `D:\Pre Thesis MVP Iterative Development`.
- [x] `package.json` scripts inspected.
- [x] Temporary write test file was created and deleted successfully.
- [x] Recent files inspected directly because this folder is not currently a Git repository.
- [x] Prisma schema inspected at `prisma/schema.prisma`.

## 3. Commands Run

- [x] `npm.cmd run prisma:generate`
- [x] `npm.cmd run prisma:deploy`
- [x] `npm.cmd run prisma:seed`
- [x] `npm.cmd run lint`
- [x] `npm.cmd run test`
- [x] `npm.cmd run build`

## 4. Automated Test Results

- [x] Prisma generate passed after clearing a local Windows file lock.
- [x] Prisma deploy passed with no pending migrations.
- [x] Prisma seed passed.
- [x] Lint passed with zero warnings.
- [x] Unit tests passed: 21 tests passed.
- [x] Production build passed.

## 5. Dashboard Testing Result

- [x] Dashboard loads successfully.
- [x] Role section such as General Manager/Admin/Sales/Staff is removed from Dashboard.
- [x] Compact KPI cards are visible:
  - Total Sales Value
  - Paid Amount
  - Outstanding Receivables
  - Need Attention
- [x] Revenue Cycle Insights section appears.
- [x] Revenue Overview, Sales Order Status, and Invoice Status are merged into one compact insight section.
- [x] Charts render from actual database/seed data.
- [x] Empty chart states are handled with clean empty-state messages in code.
- [x] Module Summary is compact.
- [x] Follow-up Reminders displays properly.
- [x] Layout is substantially more compact than the earlier long stacked dashboard.

## 6. Recent Sales Order Clickable Result

- [x] Recent Sales Orders section appears on Dashboard.
- [x] Recent Sales Order rows contain links to `/sales-orders/[id]`.
- [x] A tested recent Sales Order detail route returned HTTP 200.
- [x] Sales Order Detail page title/content appeared correctly.
- [x] Empty state exists for no recent Sales Orders.

## 7. Sales Order Detail Result

- [x] Sales Order detail page loads.
- [x] Sales Order summary appears.
- [x] Customer information appears.
- [x] Sales Order item data appears.
- [x] Related Invoice section appears.
- [x] Related Payment section appears.
- [x] Related Surat Jalan / Delivery Note section appears.
- [x] Related Receivable section appears.
- [x] Related Follow-up section appears.
- [x] Missing related data uses clean empty states.
- [x] Money values use Indonesian Rupiah formatting.
- [x] Status badges are readable.

## 8. Paid Transaction History Result

- [x] History button exists on Sales Orders page.
- [x] Create Sales Order button still exists.
- [x] Paid Transaction History page loads.
- [x] Database check found 5 Sales Orders after seeding.
- [x] Database check found 1 fully paid transaction expected in history.
- [x] Database check found 4 unpaid/partial transactions expected to be excluded.
- [x] History page includes `SO-2026-001`, the paid transaction.
- [x] History page excludes `SO-2026-002`, `SO-2026-003`, `SO-2026-004`, and `SO-2026-005`.
- [x] Paid transaction detail page loads.
- [x] Missing optional related data does not crash the page.

## 9. Audit Trails Result

- [x] Audit Trails link appears on paid transaction detail page.
- [x] Audit Trails page loads.
- [x] Timeline route is not broken.
- [x] Audit Trails remain scoped to paid transaction detail/history area.

## 10. ERD Documentation Result

- [x] `docs/ERD.md` exists.
- [x] `docs/ERD.mmd` exists.
- [x] `docs/ERD_NOTES.md` exists.
- [x] ERD is based on actual Prisma models.
- [x] ERD includes current physical models:
  - User
  - Customer
  - SalesOrder
  - SalesOrderItem
  - Invoice
  - Payment
  - FollowUp
  - DeliveryNote
  - DeliveryNoteItem
- [x] ERD does not add a physical Receivable model that does not exist in Prisma.
- [x] Logical relationship notes explain receivables as derived from Invoice data.
- [x] Mermaid ERD syntax is simple and suitable for Markdown/Mermaid tools.

## 11. Core Module Smoke Test Result

- [x] Login page loads.
- [x] Dashboard loads.
- [x] Customers page loads.
- [x] Sales Orders page loads.
- [x] Invoices page loads.
- [x] Payments page loads.
- [x] Surat Jalan page loads.
- [x] Receivables page loads.
- [x] Follow-ups page loads.
- [x] Settings page loads.
- [x] Printable Invoice route loads.
- [x] Printable Surat Jalan route loads.

## 12. Browser / Runtime Test Result

- [x] `npm.cmd run dev` started successfully in a temporary local test job.
- [x] `http://localhost:3000/login` returned HTTP 200 during runtime testing.
- [x] Authenticated route checks returned HTTP 200 using a local test session cookie.
- [ ] In-app browser console inspection could not be completed because the Windows sandbox blocked the browser connection with `CreateProcessAsUserW failed: 5`.

## 13. Bugs Found

- [x] Prisma generate initially failed with a Windows file lock:
  - Error: `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
  - Cause: stale/local Node process was holding the generated Prisma client engine file.

## 14. Fixes Applied

- [x] Stopped local Node processes to release the Prisma generated-client file lock.
- [x] Reran `npm.cmd run prisma:generate` successfully.
- [x] No application code changes were needed.
- [x] No database schema changes were made.

## 15. Remaining Issues / Manual Notes

- The in-app browser console check is still blocked by the Windows sandbox in this Codex environment. Manual visual browser review is recommended by opening `http://localhost:3000` in the normal browser.
- This folder is not currently a Git repository, so `git status` / `git diff` could not be used for recent-change inspection.
- No remaining functional blocker was found in the tested MVP flow.

## 16. Verdict

- [x] The MVP is safe to continue demo/testing.
- [x] Recent Dashboard, clickable Sales Order rows, Sales Order detail, paid history, audit trails, printable documents, and ERD documentation are stable based on automated and runtime smoke testing.

## 17. Customer Inquiry and PO Update Test - 18 July 2026

### Scope

- Customer Inquiry with multiple item lines.
- Inquiry conversion to Sales Order and Pre Order.
- PO ID, required date, and supporting PO document fields.
- Inquiry lifecycle from Open to Converted to SO/PO and Done after delivery.

### Automated Result

- [x] Unit tests validate optional inquiry price handling, conversion eligibility, and status labels.
- [x] Integration test creates a multi-item inquiry and tests both Sales Order and Pre Order conversion paths.
- [x] Integration test creates and marks the linked Surat Jalan as Delivered, then verifies the inquiry becomes Done.
- [x] Test data is rolled back at the end of the integration test.
- [x] `npm.cmd test` passed: 72 tests across 19 test files.
- [x] `npm.cmd run lint` passed with zero warnings.
- [x] `npm.cmd run build` passed.

### Manual Form-Prefill Check

- [x] Sales Order conversion form receives the inquiry ID, customer, product, quantity, and agreed price automatically.
- [x] Pre Order conversion route exposes the inquiry field, customer field, item data, and mandatory PO document field.

### Verdict

- [x] Customer Inquiry, Sales Order conversion, Pre Order conversion, and delivery-completion lifecycle are ready for UAT and thesis demonstration.
