# Final Pick, Pack, and Delivery Flow

## Purpose

This flow separates internal warehouse work from the customer-facing delivery document while preserving operational shortages and final delivery differences for audit.

## Roles

- Admin and Manager can create Picking Lists, complete Pick & Pack, create and edit Draft Surat Jalan, Issue them, and update delivery status.
- Sales can review the records but cannot mutate them.
- One PIC Pick & Pack is required when a new sheet is created.
- Historical completed sheets retain their original Picking and Packing PIC records.

## End-to-end flow

```text
Invoice active
  -> Create sheet + assign PIC Pick & Pack
  -> Pick: view item list and ordered quantities
  -> Pack: check each item, save progress as needed
  -> Complete Pick & Pack
  -> Create Draft Surat Jalan from checked items (ordered quantities initially)
  -> Adjust final delivery quantities
  -> Issue & Lock -> Print -> Delivered or Cancelled
```

## Pick & Pack

Pick is read-only item data; only Pack has item checkboxes. Completion requires one PIC and every item checked. There are no item quantity inputs, availability/shortage statuses or package-count requirements. The completed sheet is locked; Reopen with a reason resets every check while no Surat Jalan exists.

Active unlinked legacy sheets are moved to checklist mode with their previous state retained in Audit Trail. Historical completed/linked sheets and existing delivery snapshots are unchanged. Their original ready quantities remain valid for historical delivery creation; new checklist sheets use ordered quantities after every check is confirmed.

## Draft Surat Jalan

A Surat Jalan can be created only from completed Pick & Pack records. Admin or Manager first chooses a customer, then selects ready items grouped by SO / Customer PO. One Surat Jalan may combine selected ready items from several source orders when their customer and destination match. Creation is concurrency-safe and keeps each source order linked to at most one delivery document.

The new document starts as **Draft**. It copies:

- customer, recipient, destination, and delivery date;
- driver and vehicle assignment;
- source SO / Customer PO and invoice references for every included order;
- every Pick & Pack item from each included order as an audit snapshot;
- ordered and ready-to-ship quantities as immutable snapshots (the existing packed snapshot column retains this value);
- the chosen final quantity for selected items, while unselected and packed-zero items start at zero and remain recorded as outstanding.

While the document remains Draft, Admin or Manager can:

- edit the recipient and delivery assignment;
- reduce the final delivery quantity down to zero;
- restore an item up to its packed quantity;
- add an optional adjustment note.

The final delivery quantity cannot exceed the ready-to-ship snapshot. New checklist sheets start at ordered quantities; historical sheets use their originally packed quantities.

## Outstanding delivery

Outstanding is persisted per line:

```text
outstanding delivery = ordered quantity snapshot - final delivery quantity
```

The detail view also distinguishes:

- Historical preparation difference: ordered minus the ready snapshot;
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

Internal checklist sheets can print at every stage. Pick shows only item/ordered data; Pack and Completed include check results and one PIC signature. Historical sheets keep the original print layout.

A Draft cannot be printed as an official Surat Jalan. Printing becomes available only after Issue.

The printed Surat Jalan shows only lines whose final delivery quantity is greater than zero. It does not expose internal availability statuses, shortage notes, adjustment notes, or outstanding quantities.

## Audit and integrity rules

- Source order and invoice data are revalidated during Draft creation.
- Ordered and packed snapshots cannot be changed from the Draft form.
- Final quantity must be between zero and the packed snapshot.
- The database enforces quantity bounds and the outstanding formula.
- Draft save and Issue record old and new line values in Audit Trail.
- Existing historical Surat Jalan rows are backfilled with ordered = packed = final and outstanding = zero.
