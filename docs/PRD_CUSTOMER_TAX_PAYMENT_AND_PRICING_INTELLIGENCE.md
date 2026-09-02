# Product Requirements Document: Customer Tax, Payment Behaviour, Pricing, and Delivery Information

**Product:** CV Tajuk Revenue Cycle Information System
**Status:** Draft for product approval
**Date:** 12 August 2026
**Primary users:** Sales, Admin, Manager

## 1. Summary

This change adds customer tax identity, customer payment-behaviour intelligence, current-month product selling-price intelligence, an estimated tax/net-sales simulation to the Sales Order and Customer PO flows, clearer price naming, and driver/vehicle information on Surat Jalan.

The user should be able to:

- optionally record a customer's NPWP;
- see NPWP and Customer Payment Behaviour on customer detail;
- see each product's weighted average selling price for the current month;
- see Purchase Frequency Category, Payment Risk, and Customer Payment Behaviour immediately after selecting a customer in an order form;
- see the selected product's current-month average selling price;
- see estimated PPN and Net Sales (Margin) while building an order;
- carry the finalized tax calculation and customer NPWP snapshot into the invoice;
- use the same behavior for Direct Sales Orders and Customer Purchase Orders (PO);
- use `Price` instead of `Base Price` throughout the active data model and user interface; and
- select a driver and vehicle plate number before creating a Surat Jalan.

## 2. Problem Statement

The current system captures customer frequency and late-payment risk, but it does not show how a customer normally buys: immediately, on short credit, or on longer credit. Sales users therefore lack useful context when proposing terms.

The product master also shows only the base price. It does not show the actual average unit price achieved after markup and discount in the current month, so users cannot quickly compare a proposed price with recent sales. The term `Base Price` is unnecessarily technical for product and order-entry users; the requested business term is simply `Price`, while the system can continue to distinguish that value from the final adjusted Unit Price.

Finally, the order form shows a total but does not explain the estimated PPN or the net amount remaining after separating PPN. Customer NPWP is not recorded or printed on invoices, so the order-to-invoice flow lacks the requested tax identity and tax breakdown. Surat Jalan creation also lacks structured driver and vehicle plate information, which makes the delivery document incomplete for operational use.

## 3. Goals

1. Add an optional, reusable NPWP field to customer master data.
2. Derive a stable and explainable Customer Payment Behaviour tag from historical order terms.
3. Expose a product's quantity-weighted average final selling price for the current calendar month.
4. Provide real-time customer, product, PPN, and net-sales context in Sales Order and Customer PO creation.
5. Snapshot tax identity and tax amounts when an order is finalized so historical invoices do not change when customer master data or the configured tax rate changes.
6. Preserve the system's current revenue-cycle workflow, roles, approvals, payment terms, and invoice generation behavior.
7. Rename the `baseUnitPrice` attribute and all user-facing `Base Price` labels to `price` / `Price` without changing stored monetary values or pricing behavior.
8. Require a driver and vehicle plate selection before creating a Surat Jalan and print those selections on the resulting document.

## 4. Non-goals

- Filing or generating an official e-Faktur.
- Validating an NPWP against DJP/Coretax or any external service.
- Supporting multiple tax types, exemptions, luxury-goods tax, or product-level tax rules in this release.
- Building a supplier Purchase Order or procurement module.
- Calculating accounting profit, cost of goods sold, or a true gross-margin percentage.
- Automatically changing the selected payment terms based on Customer Payment Behaviour.
- Replacing Purchase Frequency Category or Payment Risk; the new tag complements them.
- Building a complete driver, fleet, scheduling, or vehicle-maintenance master module.
- Automatically assigning a fixed vehicle to a driver in this release; the two dropdowns remain independent.

## 5. Terminology and Scope Decisions

### 5.1 "PO" in this PRD

In the current application, a Customer PO is stored as a `SalesOrder` with `source = CUSTOMER_PO`, receives a Sales Order Number and Customer PO Number, requires a customer PO document and required date, and then follows the same invoice/payment/delivery flow.

Therefore, "apply this to PO" means apply all order-form insights and tax calculations to the existing **Customer PO (PO)** flow. This PRD does not introduce a supplier Purchase Order module.

### 5.2 Total, PPN, and "margin"

For this release, the current order total remains the final amount charged to the customer and is treated as **tax-inclusive** when PPN applies. PPN is separated from that amount; it is not added on top of it.

The requested `total - PPN` metric is labeled **Net Sales (Margin)** in the UI. It is net sales after separating PPN, not accounting profit. A true profit margin would also require product cost or cost-of-goods data, which is outside this release.

### 5.3 System tax trigger

The requested system rule is:

- customer has a non-empty NPWP snapshot: PPN applies;
- customer has no NPWP: PPN does not apply.

This is a configurable product rule for the thesis project, not a general statement of Indonesian tax law. Official DJP material describes invoice identity alternatives for a buyer without NPWP, including NIK in applicable cases; the presence of an NPWP alone is therefore not a complete legal test for whether PPN is due. See section 18.

## 6. User Stories

### Customer management

- As a Sales, Admin, or Manager user, I can enter an NPWP when creating or editing a customer, but I can leave it empty.
- As a user viewing customer detail, I can see the customer's NPWP or a clear "Not provided" state.
- As a user viewing customer detail, I can see Purchase Frequency Category, Payment Risk, and Customer Payment Behaviour together.
- As a user, I can understand why a payment-behaviour tag was assigned.

### Product intelligence

- As a user on the Products page, I can see the actual weighted average unit price sold for each product in the current month.
- As a Sales or Manager user creating an order, I can compare the selected product's proposed unit price with its current-month average.

### Order simulation

- As a Sales or Manager user, after selecting a customer I can immediately see the customer's type, risk, payment behaviour, and NPWP/PPN status.
- As I change quantity, price, markup, or discount, I can see the estimated total, PPN, and Net Sales (Margin) update immediately.
- As a user creating a Customer PO, I receive the same customer, product, and tax insights as in a Direct Sales Order.

### Invoice

- As an Admin or Manager user, I can generate an invoice containing the finalized PPN breakdown and the NPWP that applied when the order was finalized.
- As a user viewing an old invoice, I see the original NPWP and tax amounts even if the customer record is edited later.

### Price terminology

- As a user managing products or creating an order, I see `Price` instead of `Base Price`.
- As a developer or data maintainer, I use `price` instead of `baseUnitPrice` in the active Prisma model, server actions, form payloads, exports, seeds, tests, and documentation.
- As a user, I can still distinguish Price from Unit Price: Price is the value before markup/discount, while Unit Price is the final adjusted value.

### Surat Jalan delivery information

- As an Admin or Manager creating a Surat Jalan, I must select who will drive and which vehicle plate number will be used before saving.
- As a user viewing or printing a Surat Jalan, I can see the selected driver and plate number.
- As a user viewing an old Surat Jalan created before this feature, I see a clear `Not recorded` state rather than incorrect dummy data.

## 7. Functional Requirements

### FR-1: Optional NPWP on customer

1. Add an optional `NPWP` field to Create Customer and Edit Customer.
2. The field must not be required.
3. Trim surrounding whitespace and remove common display separators before persistence.
4. Accept 15- or 16-digit values for this system.
5. If present, NPWP must contain digits only after normalization.
6. Duplicate non-empty NPWP values must be rejected to reduce duplicate legal-customer records.
7. The form must show a concise validation error for an invalid or duplicate NPWP.
8. Customer detail must show the formatted NPWP or `Not provided`.
9. Customer list does not need a new NPWP column in this release, to avoid overcrowding the table.
10. NPWP must be included in relevant customer create/update audit-trail summaries without exposing unrelated fields.

### FR-2: Customer Payment Behaviour

Add a derived tag called **Customer Payment Behaviour**. It represents the customer's typical agreed payment terms, not whether they paid late; lateness remains Payment Risk.

#### Behaviour buckets

Each eligible historical transaction is assigned to one bucket:

| Stored term | Behaviour bucket |
|---|---|
| `IMMEDIATE` | Immediate / Cash |
| `CREDIT` and `creditTermMonths <= 1` | Short-Term Credit |
| `CREDIT` and `creditTermMonths > 1` | Long-Term Credit |

#### Observation window and eligible history

- Use the trailing 12 months from the current date in the Asia/Jakarta timezone.
- Include both Direct Sales Orders and Customer Purchase Orders.
- Include `Confirmed`, `Invoiced`, and `Shipped` transactions.
- Exclude `Draft` and `Cancelled` transactions.
- Classify by transaction count, because the requirement is how often the customer uses each term rather than which term represents the largest monetary value.

#### Tag assignment

1. Count eligible transactions in each bucket.
2. If there are no eligible transactions, return `No Payment History`.
3. If one bucket represents at least 60% of eligible transactions, return that bucket's tag.
4. If no bucket reaches 60%, return `Mixed`.
5. In a detail tooltip or supporting text, show the evidence as counts and observation window, for example: `6 of 8 orders used 1-month-or-shorter credit in the last 12 months.`
6. For one or two eligible transactions, still show the calculated tag but append `Limited history` in the explanation; do not create a separate primary tag.

#### Refresh behavior

- Calculate the tag on read from current historical data for the system; do not persist it as a customer master field.
- Recalculate after an eligible order is confirmed, invoiced, shipped, cancelled, restored to an eligible state, or has its payment terms changed.
- The current draft being created must not affect the displayed historical tag until finalized.

### FR-3: Customer detail intelligence

Customer detail must show four clearly separated fields/cards:

1. Purchase Frequency Category - existing order-frequency category.
2. Payment Risk - existing late-payment status.
3. Customer Payment Behaviour - new term-preference tag.
4. NPWP / Tax Profile - NPWP value or `Not provided`; also show `PPN enabled for new orders` or `PPN not enabled for new orders` according to the system rule.

The existing transaction history remains unchanged except that payment-behaviour evidence may link users to the same history.

### FR-4: Average product price this month

Add **Average Sold Price - This Month** to the Products list and product detail.

#### Calculation

For a product and the current calendar month in Asia/Jakarta:

```text
eligible quantity = sum(SalesOrderItem.quantity)
eligible sales value = sum(SalesOrderItem.subtotal)
average sold price = eligible sales value / eligible quantity
```

This is a quantity-weighted average final unit price. `SalesOrderItem.subtotal` already reflects the final unit price after markup and discount.

#### Eligible data

- Match by `productId`, not item name.
- Include both Sales Orders and Customer Purchase Orders.
- Use `SalesOrder.orderDate` to determine the month.
- Include `Confirmed`, `Invoiced`, and `Shipped` orders.
- Exclude `Draft` and `Cancelled` orders.
- If eligible quantity is zero, display `No sales this month`, not Rp0.
- Round to the nearest rupiah for display and calculations.

#### Product UI

- Products table: add a sortable `Avg. Sold Price (This Month)` column.
- Product detail: show the value, eligible quantity, and month label, such as `August 2026`.
- This value is read-only and derived; users cannot edit it.

### FR-5: Customer insight panel in order creation

Applies to `SALES_ORDER` and `CUSTOMER_PO`.

After a customer is selected, display a read-only Customer Insight panel immediately below the customer/payment-term section and before product entry. It must show:

- Purchase Frequency Category;
- Payment Risk;
- Customer Payment Behaviour, including limited-history note where applicable;
- NPWP, or `Not provided`;
- tax status: `PPN included` or `No PPN for this order` under the system rule; and
- the existing recommended markup associated with Purchase Frequency Category.

Changing the customer must refresh all insight values and tax calculations immediately. Clearing the customer must hide/reset the panel and PPN estimate.

The panel is advisory. It must not automatically overwrite payment terms, markup, discount, or approval status. Existing risky-customer approval rules continue to apply.

### FR-6: Product average in order lines

After a product is selected in an order line, show:

- Average Sold Price - This Month;
- proposed final Unit Price;
- absolute difference from the average; and
- percentage difference from the average when an average exists.

Formula:

```text
price difference = proposed final unit price - current-month average sold price
price difference % = price difference / current-month average sold price * 100
```

If no current-month average exists, show `No sales this month`; do not block order creation.

The average is informational only and must not replace the product Price or automatically set markup/discount.

### FR-7: Real-time order calculation

The calculation summary must update when any of these values change:

- selected customer;
- product;
- quantity;
- price;
- markup percentage;
- discount percentage; or
- added/removed order line.

Existing item calculation remains:

```text
adjusted unit price = price adjusted by markup and discount
line total = quantity * adjusted unit price
total price = sum(line totals)
```

For this release, `total price` is the tax-inclusive amount charged to the customer.

#### When the selected customer has NPWP

Use a configurable effective PPN rate. The release default is 11% under the system's non-luxury-goods assumption.

```text
net sales (margin) = round(total price / (1 + PPN rate))
PPN = total price - net sales (margin)
```

At an 11% effective rate:

```text
net sales (margin) = round(total price * 100 / 111)
PPN = total price - net sales (margin)
```

#### When the selected customer has no NPWP

```text
PPN = 0
net sales (margin) = total price
```

#### Displayed summary

Show, in this order:

1. Total Price (tax-inclusive customer charge)
2. PPN rate and PPN amount, or `Not applied - customer NPWP not provided`
3. Net Sales (Margin)

Include helper text: `Net Sales (Margin) means total after separating PPN; it is not profit after product cost.`

Use integer rupiah amounts. Derive PPN as the remainder after rounding Net Sales so `Net Sales + PPN` always equals Total Price.

### FR-8: Finalization and immutable snapshots

The live order form is a simulation until the order is successfully submitted. On submission, the server must recalculate all amounts from submitted business inputs and database master data; it must not trust client-computed totals, tax eligibility, average prices, or customer insight tags.

When saving the order, persist:

- whether PPN applied;
- effective PPN rate;
- PPN amount;
- Net Sales amount;
- customer NPWP snapshot, nullable; and
- existing subtotal/total and order lines.

The customer NPWP snapshot and tax amounts must not change when:

- customer NPWP is later edited or removed;
- the configured default tax rate changes; or
- the current-month average product price changes.

The average product price and customer intelligence shown during creation are advisory and do not need to be snapshotted in this release.

### FR-9: Invoice generation and display

Invoice generation must copy tax fields and the customer NPWP snapshot from the finalized Sales Order or Customer PO, rather than recomputing from the current customer record.

Invoice detail and printable invoice must show:

- customer/company name and address;
- `NPWP: <formatted value>` only when the snapshot is non-empty;
- Net Sales / DPP amount when PPN applies;
- PPN rate and PPN amount when PPN applies;
- Invoice Total;
- Paid Amount and Remaining Amount as currently supported.

When no NPWP snapshot exists:

- omit the NPWP row;
- omit the PPN row;
- do not print a zero-value PPN line;
- display Invoice Subtotal/Net Sales equal to Invoice Total; and
- retain all current payment and receivable behavior.

The invoice total, payment limits, remaining amount, and status continue to use the tax-inclusive finalized `totalAmount`.

### FR-10: Customer PO parity

All requirements in FR-5 through FR-9 must work in the existing Customer PO flow without removing or changing:

- generated Sales Order Number and Customer PO Number;
- required date;
- required uploaded PO document;
- inquiry-to-Customer PO conversion;
- manager approval behavior;
- invoice, payment, delivery, receivable, and collection flow.

### FR-11: Rename Base Price to Price

The active application must use **Price** as the business term for the product's pre-adjustment price.

#### Data-model rename

- Rename `Product.basePrice` to `Product.price`.
- Rename `SalesOrderItem.basePrice` to `SalesOrderItem.price`.
- Preserve `SalesOrderItem.finalUnitPrice` as the final adjusted selling price after markup and discount.
- Perform the rename with a value-preserving database migration; do not drop and recreate the columns in a way that loses existing data.
- Historical migration folders remain immutable. Only the active Prisma schema, a new forward migration, and current application artifacts are updated.

#### Application-wide rename

Update active references in:

- Prisma queries and mutations;
- product create/edit/detail/list pages;
- Sales Order and Customer PO forms and details;
- customer inquiry conversion and agreed-price defaults;
- pricing calculations and validation;
- sales-order Excel export headers and keys;
- seed data and demo fixtures;
- tests, current ERD documentation, help text, and user-flow documentation; and
- server/client payload types and serialized order items.

All user-facing labels must say `Price`, not `Base Price`. Existing formulas and allowed values remain unchanged:

```text
unit price = price adjusted by markup and discount
line total = quantity * unit price
```

The migration must preserve every existing product and order-line monetary value exactly.

### FR-12: Driver and vehicle plate on Surat Jalan

Every newly created Surat Jalan must capture a driver name and vehicle plate number before the document is saved. This applies whether creation begins:

- manually from the Surat Jalan page;
- from an Invoice;
- from a Sales Order; or
- from a Customer PO.

#### Required dropdown fields

Add two required dropdowns to the Create Surat Jalan form:

1. `Driver Name`
2. `Vehicle Plate Number` (`Nomor Plat Kendaraan`)

The initial release uses the following dummy options from one shared configuration source:

| Dropdown | Dummy options |
|---|---|
| Driver Name | Budi Santoso; Andi Pratama |
| Vehicle Plate Number | B 1234 TJK; B 5678 CVT |

Requirements:

- Each dropdown starts with a non-selectable prompt such as `Select driver` or `Select vehicle plate`.
- Both selections are required before `Save Surat Jalan` can succeed.
- Driver and plate dropdowns are independent in this release; either driver can be paired with either plate.
- The server must validate that submitted values exist in the configured allowlists and must reject missing or unknown values.
- The selected values are snapshotted as plain text on the Delivery Note so historical documents remain unchanged if dropdown options change later.
- The existing `Sender Name` field remains separate; it represents the person preparing/sending the document and must not silently become the driver field.
- Existing Immediate Payment/Credit eligibility rules must run as they do now. Passing the payment rule does not bypass driver/plate validation.

#### Surat Jalan display and print

Surat Jalan detail and printable Surat Jalan must show:

- `Driver Name` / `Nama Pengemudi`; and
- `Vehicle Plate Number` / `Nomor Plat Kendaraan`.

The printable document should use the selected driver in the current `Delivered by` information/signature area where appropriate, while retaining Sender Name as a separate field if both are displayed. Existing historical records with no driver/plate snapshot show `Not recorded` or `-`.

## 8. Proposed Data Model Changes

Names are recommendations and may be adjusted to match implementation conventions.

### Customer

| Field | Type | Required | Notes |
|---|---|---:|---|
| `npwp` | `String?` | No | Normalized 15/16 digits; unique when non-null |

Do not store Customer Payment Behaviour; derive it from history.

### SalesOrder

| Field | Type | Required | Notes |
|---|---|---:|---|
| `customerNpwpSnapshot` | `String?` | No | Customer value at finalization |
| `ppnApplied` | `Boolean` | Yes | Default `false` for migrated records |
| `ppnRateBasisPoints` | `Int` | Yes | Example: `1100` = 11.00% |
| `ppnAmount` | `Int` | Yes | Rupiah; default `0` |
| `netSalesAmount` | `Int` | Yes | Requested Net Sales (Margin) amount |

### Invoice

| Field | Type | Required | Notes |
|---|---|---:|---|
| `customerNpwpSnapshot` | `String?` | No | Copied from order |
| `ppnApplied` | `Boolean` | Yes | Copied from order |
| `ppnRateBasisPoints` | `Int` | Yes | Copied from order |
| `ppnAmount` | `Int` | Yes | Copied from order |
| `netSalesAmount` | `Int` | Yes | Copied from order |

### Product

| Field change | Type | Required | Notes |
|---|---|---:|---|
| `baseUnitPrice` -> `price` | `Int` | Yes | Value-preserving rename; product price before markup/discount |

### SalesOrderItem

| Field change | Type | Required | Notes |
|---|---|---:|---|
| `baseUnitPrice` -> `price` | `Int` | Yes | Value-preserving order-line snapshot before markup/discount |

`finalUnitPrice` remains unchanged and stores the adjusted final selling price.

### DeliveryNote

| Field | Type | Required | Notes |
|---|---|---:|---|
| `driverName` | `String?` | Required for new records | Nullable in storage for backward compatibility with existing documents |
| `vehiclePlateNumber` | `String?` | Required for new records | Selected plate snapshot; nullable only for existing migrated records |

### Configuration

For this system, the default effective PPN rate may be an application constant or environment-backed configuration. It must not be hard-coded independently in client, server, invoice, and test code. Use one shared server-owned source of truth and send the applicable rate to the form.

The dummy driver and vehicle plate options must also live in one shared configuration source used by the form and server validation. Do not duplicate independent hard-coded arrays across UI and server files.

## 9. UX Requirements

### Create/Edit Customer

- Label: `NPWP (Optional)`
- Placeholder may show a common 15/16-digit example, but must not insert a fake value.
- Helper: `Used for the order tax simulation and copied to new invoices.`
- Empty input saves `null`, never an empty string.

### Customer Detail

- Add Customer Payment Behaviour beside the current Purchase Frequency Category and Payment Risk summary.
- Add an NPWP/Tax Profile field.
- Use existing badge and card visual language.
- Tooltips must explain calculated tags in plain language.

### Products

- Add one compact average-price column and one detail field.
- Rename every existing `Base Price` label, input, column, help description, and export heading to `Price`.
- Use `No sales this month` as the empty state.
- The column must remain usable on small screens through the existing responsive/scroll behavior.

### Sales Order and Customer PO creation

- Customer Insight panel appears only after customer selection.
- Product average appears inside or directly below its order line, so the user does not need to leave the form.
- Keep the current sequence: Customer -> Payment Terms -> Customer Insight -> Products and pricing -> Calculation Summary -> Finalize.
- Calculation Summary must be visually distinct but compact.
- Estimated values should use an `Estimated` label until submission succeeds.
- Confirmation dialog should show Total, PPN, and Net Sales before final submit.

### Invoice

- Tax identity appears in `Bill To` or invoice metadata.
- Tax breakdown appears directly above Invoice Total.
- Do not render empty placeholders for NPWP or PPN on non-PPN invoices.

### Surat Jalan

- Place the required Driver Name and Vehicle Plate Number dropdowns with the delivery metadata, before the item list and Save action.
- Use the same dropdowns for manual creation and creation prefilled from an Invoice, Sales Order, or Customer PO.
- Do not preselect the first dummy option; users must make an explicit selection.
- Show the saved driver and vehicle plate on Surat Jalan detail and printable views.
- Preserve the current Sender Name, Receiver Name, Authorized By, recipient, item, and status fields.

## 10. Permissions and Audit

- Existing role permissions remain unchanged.
- Any role currently permitted to create/edit a customer may create/edit NPWP.
- Any role able to view customer or invoice detail may view the NPWP in this system.
- Order tax snapshots are server-generated and not directly editable.
- Audit tax-relevant changes:
  - customer NPWP added, changed, or removed;
  - order finalized with PPN applied/not applied and its amounts;
  - invoice generated with copied tax snapshot.
- Audit each Surat Jalan creation with the selected driver and vehicle plate in the structured new-value payload/change summary.
- Existing Admin/Manager permission for Surat Jalan creation remains unchanged.

## 11. Backward Compatibility and Migration

1. Add nullable `Customer.npwp`.
2. Add new SalesOrder and Invoice fields with safe defaults.
3. Existing customers migrate with `npwp = null`.
4. Existing orders/invoices migrate with:
   - `customerNpwpSnapshot = null`;
   - `ppnApplied = false`;
   - `ppnRateBasisPoints = 0`;
   - `ppnAmount = 0`; and
   - `netSalesAmount = existing total`.
5. Do not retroactively infer PPN for historical documents from a customer's newly entered NPWP.
6. Seed data should include customers with and without NPWP and enough order history to exercise every payment-behaviour tag.
7. Rename the active `Product.basePrice` and `SalesOrderItem.basePrice` columns to `price` through a value-preserving forward migration.
8. Verify row counts and price values before and after the rename; no product or historical order-line value may change.
9. Add nullable `DeliveryNote.driverName` and `DeliveryNote.vehiclePlateNumber` columns so existing documents remain valid.
10. Do not populate historical delivery notes with dummy drivers or plates. Only newly created records require selections.
11. Update new delivery-note seed records to include valid configured driver and plate snapshots.

## 12. Edge Cases

- Customer NPWP is added after an order was finalized: old order/invoice stays unchanged; new orders use the new NPWP.
- Customer NPWP is removed after finalization: old invoice keeps its snapshot.
- Customer changes before draft submission: reset and recalculate tax status.
- Product has no current-month sales: show no-data state; do not divide by zero.
- Historical item has a null `productId`: exclude it from product average even if its item name matches.
- Cancelled order was previously included: it must stop contributing to payment behaviour and average product price.
- Order crosses a month boundary while the form is left open: server submission uses current valid data and business date; advisory average may refresh on reload.
- Total is zero: PPN and Net Sales are zero, but normal order validation should continue to prevent invalid zero-value orders where applicable.
- Rounding: PPN is always the difference between Total and rounded Net Sales, preventing a one-rupiah reconciliation gap.
- Duplicate customer legal entity: duplicate non-empty normalized NPWP is rejected.
- Payment behaviour ties: if no bucket reaches 60%, return `Mixed`; do not use a hidden tie-breaker.
- A IMMEDIATE invoice paid by bank transfer still contributes to `Immediate / Cash`; the tag represents agreed payment terms, not the later payment channel.
- An existing Surat Jalan has no driver/plate after migration: detail and print show `Not recorded` or `-`; the record remains viewable and printable.
- A submitted driver or plate is not in the configured allowlist: reject creation with a field-level error and create no partial Delivery Note.
- Driver/plate options change later: existing Surat Jalan snapshots remain unchanged.
- A user selects a driver but no plate, or a plate but no driver: block creation and identify the missing field.
- Renaming `baseUnitPrice` must not rename `finalUnitPrice`; the two attributes retain distinct meanings.
- Stale clients submit `baseUnitPrice` after deployment: reject with a clear validation failure or update all first-party clients atomically; do not silently save a zero price.

## 13. Acceptance Criteria

### NPWP

- A customer can be created and edited without NPWP.
- A valid 15/16-digit NPWP can be saved and appears on customer detail.
- Invalid and duplicate normalized NPWP values are rejected.
- Editing customer NPWP does not alter existing finalized orders or invoices.

### Customer Payment Behaviour

- No eligible history returns `No Payment History`.
- At least 60% IMMEDIATE history returns `Immediate / Cash`.
- At least 60% CREDIT history of one month or less returns `Short-Term Credit`.
- At least 60% CREDIT history over one month returns `Long-Term Credit`.
- No bucket at 60% returns `Mixed`.
- Draft/cancelled orders do not affect the tag.
- Both Sales Orders and Customer Purchase Orders can affect the tag after becoming eligible.

### Average product price

- The displayed value equals `sum(subtotal) / sum(quantity)` for eligible current-month items.
- Markup and discount are reflected through stored final item subtotals.
- Draft/cancelled and prior-month orders are excluded.
- No eligible sale shows `No sales this month`.
- The same value is available on Products and in the selected order line.

### Order simulation

- Customer insights appear immediately after a customer is selected.
- Product average appears immediately after product selection.
- Total, PPN, and Net Sales update after any pricing/quantity/customer change.
- With NPWP and Total Rp1,110,000 at 11%, Net Sales is Rp1,000,000 and PPN is Rp110,000.
- Without NPWP and Total Rp1,110,000, Net Sales is Rp1,110,000 and PPN is Rp0/not applied.
- The server rejects or corrects manipulated client totals by recalculating on submission.

### Invoice and Customer PO

- Invoice tax values exactly match the finalized order snapshot.
- PPN invoice shows NPWP, Net Sales/DPP, PPN, and Invoice Total.
- Non-PPN invoice omits NPWP and PPN rows.
- Invoice payment/remaining calculations continue to use Invoice Total.
- Direct Sales Orders and Customer Purchase Orders pass the same tax and intelligence scenarios.

### Price rename

- Active Prisma models expose `Product.price` and `SalesOrderItem.price`; `baseUnitPrice` is no longer used by active application code.
- All user-facing pages, forms, exports, help text, and current documentation say `Price` instead of `Base Price`.
- `finalUnitPrice` still stores and displays the final price after markup/discount.
- Existing product and order-line price values are identical before and after migration.
- Product creation, editing, inquiry conversion, Direct Sales Order creation, and Customer PO creation continue to calculate the same totals.

### Surat Jalan driver and vehicle

- Driver Name and Vehicle Plate Number are required dropdowns for all Surat Jalan creation entry points.
- The Driver dropdown contains Budi Santoso and Andi Pratama.
- The Vehicle Plate dropdown contains B 1234 TJK and B 5678 CVT.
- The first option is a prompt and is not accepted as a value.
- Missing, manipulated, or unknown values are rejected by the server without creating a Delivery Note.
- The selected driver and plate are stored on the new Delivery Note and shown on detail and print views.
- Existing Delivery Notes without these fields remain accessible and display `Not recorded` or `-`.
- Existing Immediate Payment/Credit eligibility rules and role restrictions still apply.

## 14. Test Plan

### Unit tests

- NPWP normalization and validation.
- Payment-behaviour bucket mapping, 60% threshold, mixed result, limited history, and date/status filters.
- Weighted average sold-price calculation and zero-quantity guard.
- Tax-inclusive PPN extraction with rounding.
- No-NPWP tax calculation.
- Order-to-invoice snapshot mapping.
- Price-field parsing, validation, and adjusted Unit Price calculation after the rename.
- Driver/plate allowlist validation for valid, missing, and unknown values.

### Integration tests

- Create customer without NPWP -> create order -> no PPN -> invoice omits NPWP/PPN.
- Create customer with NPWP -> create order -> tax simulation -> finalize -> invoice copies exact values.
- Edit NPWP after invoice generation -> invoice remains unchanged.
- Confirm/cancel orders -> payment behaviour and product average update correctly.
- Convert inquiry to Sales Order and Customer PO -> insights and tax behavior remain identical.
- Manipulate client tax fields -> server result remains authoritative.
- Run the price-column migration against representative records -> row counts and monetary values are preserved.
- Create Surat Jalan manually and from Invoice, Sales Order, and Customer PO -> selected driver/plate are persisted and printed.
- Attempt Surat Jalan creation with a missing or manipulated dropdown value -> no Delivery Note is created.

### UAT scenarios

- Sales compares proposed product price with this month's actual average.
- Sales reviews customer behaviour/type/risk before choosing payment terms.
- Manager reviews a risky order and sees the tax/net-sales summary before approval.
- Admin generates and prints an invoice with NPWP and PPN.
- Admin generates and prints an invoice for a customer without NPWP and sees no tax fields.
- Sales creates an order using the renamed Price field and confirms the same markup/discount result.
- Admin selects a driver and vehicle plate, creates Surat Jalan, and verifies both values on the printable document.

## 15. Success Metrics

For the thesis project, success is demonstrated through completeness and correctness rather than production analytics:

- 100% of newly finalized orders have reconciled tax snapshots: `Net Sales + PPN = Total`.
- 100% of generated invoices match their source order tax snapshot.
- All eligible products return the expected weighted current-month average in automated fixtures.
- All payment-behaviour categories are represented and explainable in seed/UAT data.
- 100% of migrated product and historical order-line price values are preserved after the `baseUnitPrice` to `price` rename.
- 100% of newly created Surat Jalan records contain an allowlisted driver and vehicle plate snapshot.
- No regression in current order approval, invoice payment, delivery, receivable, or Customer PO flows.

## 16. Delivery Sequence

1. Database migration for NPWP/tax snapshots, the price-column rename, and nullable driver/plate snapshots.
2. Shared calculation, PPN, driver/plate option, and validation utilities.
3. Application-wide `baseUnitPrice` to `price` code/UI/export/documentation rename.
4. NPWP customer create/edit/detail support.
5. Customer Payment Behaviour calculation and display.
6. Product current-month average calculation and Products UI.
7. Sales Order/Customer PO customer and product insights.
8. Real-time and server-authoritative tax calculations plus snapshots.
9. Invoice detail/print tax rendering.
10. Surat Jalan driver/plate dropdowns, persistence, detail, and print rendering.
11. Seed data, automated tests, UAT/test documentation, and regression validation.

## 17. Product Decisions Required Before Implementation

The PRD proceeds with recommended defaults, but the product owner should explicitly approve these decisions before the feature is treated as legally deployable:

1. **Tax trigger:** keep the current system rule "NPWP present means PPN; no NPWP means no PPN," or replace it with a legally reviewed tax-eligibility field independent of NPWP.
2. **Tax rate/product scope:** confirm that the catalog is limited to goods using the assumed 11% effective PPN treatment; otherwise product-level tax classification is needed.
3. **Price semantics:** confirm that entered/final item prices are tax-inclusive. If prices are tax-exclusive, the formulas and Invoice Total must change to add PPN on top.
4. **Metric label:** approve `Net Sales (Margin)` or rename it to `Net Sales / DPP`; `Margin` alone could be mistaken for profit.
5. **PO meaning:** confirm that PO means the application's existing Customer PO flow and not a new supplier Purchase Order module.
6. **Dummy delivery options:** approve the initial drivers (Budi Santoso and Andi Pratama) and plates (B 1234 TJK and B 5678 CVT), or replace the names/plates before implementation.
7. **Future delivery master data:** confirm that configurable dropdown allowlists are sufficient for the system; a relational Driver/Vehicle master and fixed driver-vehicle assignments are deferred.

## 18. Tax/Legal Note and Official References

This PRD specifies product behavior, not tax advice. The default 11% effective assumption reflects the post-2025 calculation described by DJP for applicable non-luxury transactions using `12% x 11/12 x DPP`. DJP also describes invoice identity handling where a buyer does not have NPWP, including use of NIK in applicable cases. These points are why NPWP presence should not be treated as a complete legal PPN eligibility rule outside the thesis project.

- Direktorat Jenderal Pajak, [Pemerintah Terbitkan Aturan DPP Nilai Lain dan Besaran Tertentu PPN](https://pajak.go.id/id/siaran-pers/pemerintah-terbitkan-aturan-dpp-nilai-lain-dan-besaran-tertentu-ppn)
- Direktorat Jenderal Pajak, [Penggunaan Nomor Pokok Wajib Pajak pada Sistem Administrasi Perpajakan](https://www.pajak.go.id/index.php/id/pengumuman/penggunaan-nomor-pokok-wajib-pajak-pada-sistem-administrasi-perpajakan)
- Direktorat Jenderal Pajak, [Update e-Faktur 4.0, Wajib Pajak Sidrap Pahami Fitur Baru](https://www.pajak.go.id/id/berita/update-e-faktur-40-wajib-pajak-sidrap-pahami-fitur-baru)
