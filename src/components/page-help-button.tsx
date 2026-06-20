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
    "Use action buttons on each row to view, print, update, or continue the transaction."
  ]
};

const helpByRoute: Array<{ match: (pathname: string) => boolean; content: HelpContent }> = [
  {
    match: (pathname) => pathname === "/",
    content: {
      title: "Dashboard Help",
      purpose:
        "Use the Dashboard to quickly monitor sales, payments, receivables, overdue invoices, and billing workload.",
      steps: [
        "Start with the top summary cards to understand the overall condition.",
        "Check receivable and overdue sections to see payment risk.",
        "Use recent orders, invoices, payments, and billing tasks to decide which module to open next."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/customers",
    content: {
      title: "Customers Help",
      purpose: "Use Customers to manage company and contact records used in transactions.",
      steps: [
        "Use Add Customer to create a customer master record.",
        "Search by customer name, company, phone, or email.",
        "Use view or edit actions before creating Sales Orders for that customer."
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
        "Check the summary card for order status, invoice, payments, and remaining amount.",
        "Review customer, item, invoice, payment, Surat Jalan, receivable, and billing sections.",
        "Use available buttons to print invoice, record payment, or continue the transaction flow."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/sales-orders",
    content: {
      title: "Sales Orders Help",
      purpose: "Use Sales Orders to start and monitor the revenue cycle transaction flow.",
      steps: [
        "Click Create Sales Order to select a customer, add items, and choose payment term.",
        "The system generates a connected invoice after confirmation.",
        "Use Need Approval to review risky Sales-created orders, Ongoing Process for active orders, and Done Process for completed or closed orders."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/invoices/") && pathname.endsWith("/print"),
    content: {
      title: "Printable Invoice Help",
      purpose: "Use this page to review and print the customer invoice document.",
      steps: [
        "Check customer, invoice number, date, due date, items, and totals before printing.",
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
        "Review due date, payment term, total, paid, and remaining amount.",
        "Use View / Print Invoice for the document view, or create Surat Jalan when the transaction rule allows it."
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
    match: (pathname) => pathname.startsWith("/surat-jalan/") && pathname.endsWith("/print"),
    content: {
      title: "Printable Surat Jalan Help",
      purpose: "Use this page to review and print the delivery note document.",
      steps: [
        "Check recipient, delivery date, delivery status, and item list.",
        "Use the print button when the delivery note information is correct.",
        "Return to Surat Jalan or Sales Order detail after printing or review."
      ]
    }
  },
  {
    match: (pathname) => pathname.startsWith("/surat-jalan"),
    content: {
      title: "Surat Jalan Help",
      purpose: "Use Surat Jalan to create, update, and print delivery notes.",
      steps: [
        "Create Surat Jalan from an invoice or Sales Order when allowed.",
        "Review recipient, delivery date, status, and delivered items.",
        "Use View / Print for the delivery document, or Edit Status to update delivery progress."
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
        "Use Create Billing when a customer billing reminder is needed."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/billing",
    content: {
      title: "Billing Help",
      purpose: "Use Billing to record customer collection reminders related to open invoices or general billing contact.",
      steps: [
        "Select customer and optional invoice.",
        "Set billing date, status, and notes.",
        "Use the list to monitor planned, done, or cancelled billing activities."
      ]
    }
  },
  {
    match: (pathname) => pathname === "/follow-ups",
    content: {
      title: "Follow Up Help",
      purpose: "Use Follow Up to track the last time each customer was contacted about new products.",
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
      purpose: "Use Settings to manage local demo user accounts for the thesis MVP.",
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
      purpose: "Use Login to enter the local thesis MVP before accessing the revenue cycle modules.",
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
        className="no-print fixed bottom-4 right-4 z-40 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand/95 sm:bottom-5 sm:right-5 sm:px-4"
        title="Page help"
      >
        <HelpCircle aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">Help</span>
      </button>

      {isOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-end bg-slate-900/20 p-3 sm:p-6">
          <section className="max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-md border border-slate-200 bg-white shadow-soft sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  How to use this page
                </p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{content.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-ink"
                title="Close help"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm leading-6 text-slate-600">{content.purpose}</p>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                {content.steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-brand">
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
