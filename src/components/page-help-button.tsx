"use client";

import { useMemo, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";

type HelpContent = {
  title: string;
  purpose: string;
  steps: string[];
};

const defaultHelp: HelpContent = {
  title: "Page Help",
  purpose: "This page supports the CV Tajuk revenue cycle workflow.",
  steps: [
    "Review the page title and summary first.",
    "Use the main table or form to continue the workflow.",
    "Use action buttons on each row to view, print, update, or continue the workflow."
  ]
};

const helpByRoute: Array<{ match: (pathname: string) => boolean; content: HelpContent }> = [
  {
    match: (pathname) => pathname === "/",
    content: {
      title: "Dashboard Help",
      purpose:
        "Use the Dashboard to quickly monitor sales, payments, receivables, overdue invoices, and collection workload.",
      steps: [
        "Start with the top summary cards to understand the overall condition.",
        "Check receivable and overdue sections to see unpaid balances.",
        "Use recent orders, invoices, payments, and collection tasks to decide which module to open next."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/customers",
    content: {
      title: "Customers Help",
      purpose: "Use Customers to manage company, contact, and optional NPWP records used in orders.",
      steps: [
        "Use Add Customer to create a customer master record, with an optional NPWP for tax handling.",
        "Search by contact person, company, phone, or email.",
        "Use view to review customer segment, payment status, outstanding amount, payment behaviour, and the tax profile. Outstanding Payment starts when an unpaid invoice has a Delivered Surat Jalan."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/products",
    content: {
      title: "Products Help",
      purpose: "Use Products to manage product names, production costs, notes, and availability status.",
      steps: [
        "Admin uses Add Product to create a product and enter its production cost per unit excluding PPN.",
        "Search products by name or notes, and sort the average production-cost column when comparing products.",
        "Use view to compare the latest production cost with its time-weighted average over the last 30 days. Days before cost history began are excluded.",
        "Admin changes production cost through Edit Product. Each cost change starts a new history entry; other product edits do not change the average."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/sales-orders/"),
    content: {
      title: "Sales Order Detail Help",
      purpose:
        "Use Sales Order Detail as the central hub for one order and its related revenue cycle records.",
      steps: [
        "Check the summary card for the snapshotted NPWP, PPN, Net Sales, order status, invoice, payments, and remaining amount.",
        "Review customer, item, invoice, payment, Surat Jalan, receivable, and collection sections.",
        "Use Edit Barang in Item Details to change products or quantities, then review the changes and provide a reason before saving. Editing closes after payment, entering Pack, or creating a Surat Jalan; the button explains any restriction.",
        "Use available buttons to print an invoice, record payment, or continue the order workflow."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/sales-orders",
    content: {
      title: "Sales Orders Help",
      purpose: "Use Sales Orders to start and monitor the direct-order revenue cycle.",
      steps: [
        "Click Create Sales Order to select a customer, compare the proposed selling price excluding PPN with the last-30-day average production cost, add items, and choose payment terms.",
        "Review the estimated Total Price, PPN, and Net Sales calculation before confirming the order.",
        "The system generates a connected invoice after confirmation.",
        "Use Need Approval to review Sales-created orders requiring approval for outstanding payments, Open for active orders, and Completed for completed or closed orders."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/customer-purchase-orders"),
    content: {
      title: "Customer Purchase Orders Help",
      purpose: "Use Customer Purchase Orders to manage orders received from customer POs and monitor product required dates.",
      steps: [
        "Create a Customer PO using the required date and uploaded customer PO document. Enter a Customer PO Number or leave it blank for automatic numbering; Sales Order Number is generated automatically.",
        "Review the same customer, product, PPN, and Net Sales estimates used by Direct Sales Orders before confirming.",
        "Review the PO detail and process it before the required date reminder becomes overdue.",
        "Use Edit Barang in the detail item table to correct products or quantities. Saving requires a reason and updates the connected invoice and Pick sheet. Editing closes after payment, entering Pack, or creating a Surat Jalan.",
        "Continue with invoice, payment, receivable, collection, and Surat Jalan using the same process as Sales Orders."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/invoices/") && pathname.endsWith("/print"),
    content: {
      title: "Printable Invoice Help",
      purpose: "Use this page to review and print the customer invoice document.",
      steps: [
        "Check customer, snapshotted NPWP where present, Net Sales, PPN, invoice number, dates, items, and total before printing.",
        "Use the print button to open the browser print dialog.",
        "Return to the invoice list or Sales Order detail after the document is checked."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/invoices"),
    content: {
      title: "Invoices Help",
      purpose: "Use Invoices to review generated invoices, payment status, and printable invoice documents.",
      steps: [
        "Select an invoice from the list to view its detail.",
        "Review the snapshotted NPWP and tax breakdown, due date, payment terms, total, paid, and remaining amount.",
        "Use View / Print Invoice for the document view, or open the warehouse workflow to prepare a Picking List."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/payments",
    content: {
      title: "Payments Help",
      purpose: "Use Payments to record full or partial payment against open invoices.",
      steps: [
        "Choose an open invoice from the payment queue.",
        "Enter payment date, amount, method, and optional notes.",
        "After saving, invoice paid and remaining amounts update automatically."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/pick-pack/") && pathname.endsWith("/print"),
    content: {
      title: "Picking List Print Help",
      purpose: "Print the internal Pick & Pack sheet and recorded checks.",
      steps: ["Check customer, invoice, order reference, and ordered quantities.", "Pick shows the item list; Pack and Completed include recorded item checks and one PIC Pick & Pack signature.", "Historical sheets retain their original quantities and personnel records."]
    }
  },
  {
    match: (pathname) => pathname === "/pick-pack",
    content: {
      title: "Pick & Pack Help",
      purpose: "Create and verify Picking Lists before orders are issued as Surat Jalan.",
      steps: [
        "Use Active to create a Picking List for an invoiced Sales Order or Customer PO with one PIC Pick & Pack.",
        "Pick displays products and ordered quantities. Use Lanjut ke Pack to open the item checklist.",
        "In Pack, check each item and use Save Progress as needed. Selesaikan Pick & Pack requires the PIC and every item checked; no quantity input is required.",
        "Completed sheets are locked. Historical sheets retain their original quantity and personnel records.",
        "Use the single PIC filter, completion dates and Surat Jalan status to find completed sheets. Print is available for both checklist and historical sheets.",
        "Admin and Manager can Reopen a completed list with a reason while no Surat Jalan exists. Every Pack check is reset.",
        "Use Create Surat Jalan to continue in the separate delivery module."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/surat-jalan/") && pathname.endsWith("/print"),
    content: {
      title: "Printable Surat Jalan Help",
      purpose: "Use this page to review and print the delivery note document.",
      steps: [
        "Check recipient, driver, vehicle plate, delivery date, delivery status, and item list.",
        "Use the print button when the delivery note information is correct.",
        "Return to Surat Jalan or Sales Order detail after printing or review."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/surat-jalan"),
    content: {
      title: "Surat Jalan Help",
      purpose: "Prepare, issue, and track Surat Jalan after warehouse preparation is complete.",
      steps: [
        "Choose a customer, then select items from completed SO / Customer PO sheets for the same destination. Checklist sheets use ordered quantities; historical sheets use their recorded ready quantities.",
        "While Draft, adjust recipient, delivery assignment, and final quantity up to each ready-to-ship quantity. Review the stored outstanding delivery.",
        "Pilih Kirim Surat Jalan ketika jumlah final sudah benar. Setelah dikirim, data terkunci dan dokumen dapat dicetak.",
        "Gunakan Tandai Sudah Diterima untuk mencatat nama penerima, waktu penerimaan, dan catatan opsional. Surat Jalan yang diterima berpindah ke Completed; yang dibatalkan masuk arsip terpisah."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/receivables",
    content: {
      title: "Receivables Help",
      purpose: "Use Receivables to monitor unpaid, partial, and overdue invoice balances.",
      steps: [
        "Use status filters to focus on unpaid, partial, or overdue receivables.",
        "Review remaining amount and due date to prioritize collection.",
        "Use Create Collection Task when a payment collection reminder is needed."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/collections",
    content: {
      title: "Collections Help",
      purpose: "Use Collections to schedule and record payment collection work for open invoices or a customer.",
      steps: [
        "Select customer and optional invoice.",
        "Set the scheduled date, status, and notes.",
        "Use the list to monitor planned, done, or cancelled collection tasks."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/customer-outreach",
    content: {
      title: "Customer Outreach Help",
      purpose: "Use Customer Outreach to track the last time each customer was contacted about new products.",
      steps: [
        "Select a customer and the date they were contacted.",
        "Optionally add a note about the product or conversation.",
        "Use the customer list to find customers who have never been contacted or need another update."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/settings",
    content: {
      title: "Settings Help",
      purpose: "Use Settings to manage user accounts for the CV Tajuk Revenue Cycle Information System.",
      steps: [
        "Create an account by filling username, display name, password, role, and status.",
        "Use Active or Inactive status to control whether the account can log in.",
        "This is simple local demo access, not production security."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/login",
    content: {
      title: "Login Help",
      purpose: "Use Login to access the CV Tajuk Revenue Cycle Information System.",
      steps: [
        "Enter the demo username and password prepared for the thesis demonstration.",
        "After login, the system opens the Dashboard.",
        "This login is for local demo access only."
      ]
    }
  }
];

export function PageHelpButton() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const content = useMemo(
    () => helpByRoute.find((item) => item.match(pathname))?.content ?? defaultHelp,
    [pathname]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="no-print fixed bottom-4 right-4 z-40 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white shadow-card transition hover:bg-brand/95 sm:bottom-5 sm:right-5 sm:px-4"
        title="Page help"
      >
        <HelpCircle aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">Help</span>
      </button>

      {isOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-end bg-strong/20 p-3 sm:p-6">
          <section className="max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-md border border-line bg-white shadow-card sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  How to use this page
                </p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{content.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink/70 transition hover:bg-soft hover:text-ink"
                title="Close help"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm leading-6 text-ink/80">{content.purpose}</p>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-ink">
                {content.steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-canvas text-xs font-semibold text-brand">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
