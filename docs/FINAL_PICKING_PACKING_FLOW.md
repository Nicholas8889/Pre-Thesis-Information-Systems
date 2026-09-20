# Final Pick, Pack, and Delivery Flow

## Purpose

This flow separates internal warehouse work from the customer-facing delivery document while preserving operational shortages and final delivery differences for audit.

## Roles

- Admin and Manager can create Picking Lists, complete Pick & Pack, create and edit Draft Surat Jalan, Issue them, and update delivery status.
- Sales can review the records but cannot mutate them.
- Picking PIC is required when the Picking List is created.
- Packing PIC is required when Pick & Pack is completed.

## End-to-end flow

```text
Invoice active
  -> Create Picking List + assign Picking PIC
  -> Check availability and packed quantity per item
  -> Assign Packing PIC
  -> Complete Pick & Pack
  -> Select packed items across completed SO / Customer PO records
  -> Create Draft Surat Jalan
  -> Adjust final delivery header and quantities
  -> Issue & Lock
  -> Print final positive-quantity lines
  -> Delivered or Cancelled
```

## Pick & Pack

The Picking List copies customer, order reference, invoice reference, item, and ordered quantity from the transaction. The warehouse records:

- availability status: Unchecked, Available, Partial, or Unavailable;
- available quantity;
- packed quantity;
- an operational shortage note when the ordered quantity cannot be fulfilled.

Completion is allowed with a shortage when every item has been checked, every available unit is packed, and every shortage has a note. A completed list is immutable unless Admin or Manager reopens it before a Surat Jalan exists.

## Draft Surat Jalan

A Surat Jalan can be created only from completed Pick & Pack records. Admin or Manager first chooses a customer, then selects packed items grouped by SO / Customer PO. One Surat Jalan may combine selected items from several source orders when their customer and destination match. Creation is concurrency-safe and keeps each source order linked to at most one delivery document.

The new document starts as **Draft**. It copies:

- customer, recipient, destination, and delivery date;
- driver and vehicle assignment;
- source SO / Customer PO and invoice references for every included order;
- every Pick & Pack item from each included order as an audit snapshot;
- ordered and packed quantities as immutable snapshots;
- the chosen final quantity for selected items, while unselected and packed-zero items start at zero and remain recorded as outstanding.

While the document remains Draft, Admin or Manager can:

- edit the recipient and delivery assignment;
- reduce the final delivery quantity down to zero;
- restore an item up to its packed quantity;
- add an optional adjustment note.

The final delivery quantity cannot exceed the packed quantity.

## Outstanding delivery

Outstanding is persisted per line:

```text
outstanding delivery = ordered quantity snapshot - final delivery quantity
```

The detail view also distinguishes:

- Pick & Pack shortage: ordered minus packed;
- Draft reduction: packed minus final delivery quantity.

Outstanding is informational and auditable. This version still allows only one Surat Jalan per order, so it does not create an automatic follow-up shipment.

## Issue and locking

**Issue & Lock** saves the current Draft and changes its status to Issued in one transaction. At least one line must have a positive final delivery quantity.

Issue records the timestamp and operator. After Issue:

- header and item quantities cannot be edited;
- the Picking List cannot be reopened;
- only Delivered or Cancelled remain valid status transitions;
- all changes and final quantities remain available in Audit Trail.

Optimistic version checks and row locks prevent two operators from overwriting the same Draft.

## Printing

A Draft cannot be printed as an official Surat Jalan. Printing becomes available only after Issue.

The printed Surat Jalan shows only lines whose final delivery quantity is greater than zero. It does not expose internal availability statuses, shortage notes, adjustment notes, or outstanding quantities.

## Audit and integrity rules

- Source order and invoice data are revalidated during Draft creation.
- Ordered and packed snapshots cannot be changed from the Draft form.
- Final quantity must be between zero and the packed snapshot.
- The database enforces quantity bounds and the outstanding formula.
- Draft save and Issue record old and new line values in Audit Trail.
- Existing historical Surat Jalan rows are backfilled with ordered = packed = final and outstanding = zero.
