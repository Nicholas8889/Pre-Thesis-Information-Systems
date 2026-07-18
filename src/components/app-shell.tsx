"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BarChart3,
  ChevronDown,
  ClipboardList,
  FileText,
  MessageSquareText,
  Handshake,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  PhoneCall,
  Settings,
  ShoppingCart,
  Truck,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import { logout } from "@/lib/auth-actions";
import { PageHelpButton } from "@/components/page-help-button";
import { NotificationButton } from "@/components/notification-button";
import type { AppNotification } from "@/lib/notifications";
import { TableEnhancer } from "@/components/table-enhancer";
import { ActionConfirmationDialog } from "@/components/action-confirmation-dialog";
import { CardHelpEnhancer } from "@/components/card-help-enhancer";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navigationSections: Array<{ title: string; items: NavigationItem[] }> = [
  {
    title: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    title: "Master Data",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/products", label: "Products", icon: Package }
    ]
  },
  {
    title: "Sales",
    items: [
      { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart },
      { href: "/pre-orders", label: "Pre Orders", icon: ClipboardList },
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/surat-jalan", label: "Surat Jalan", icon: Truck }
    ]
  },
  {
    title: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: Banknote },
      { href: "/receivables", label: "Receivables", icon: ReceiptText },
      { href: "/billing", label: "Billing", icon: Handshake }
    ]
  },
  {
    title: "Customer Relationship",
    items: [
      { href: "/follow-ups", label: "Follow Up", icon: PhoneCall },
      { href: "/customer-inquiries", label: "Customer Inquiry", icon: MessageSquareText }
    ]
  },
  {
    title: "System",
    items: [
      { href: "/audit-trail", label: "Audit Trail", icon: History },
      { href: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

const navigation = navigationSections.flatMap((section) => section.items);

function isNavigationItemActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  notifications = [],
  userId,
  userRole
}: {
  children: React.ReactNode;
  notifications?: AppNotification[];
  userId?: string;
  userRole?: string;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <div className="min-h-screen bg-surface text-ink">
        {children}
        <PageHelpButton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-72 flex-col overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <Link href="/" className="mb-8 flex shrink-0 items-center gap-3 rounded-md px-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand text-sm font-bold text-white shadow-sm">
            CT
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold tracking-normal text-ink">CV Tajuk</span>
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Revenue Cycle MVP
            </span>
          </span>
          {userRole && (
            <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand ring-1 ring-inset ring-blue-200">
              {userRole}
            </span>
          )}
        </Link>

        <nav className="flex-1 space-y-2" aria-label="Main navigation">
          {navigationSections.map((section) => (
            <details key={section.title} open className="group">
              <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 [&::-webkit-details-marker]:hidden">
                <span>{section.title}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="mt-1 space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isNavigationItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                        isActive
                          ? "bg-brand text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                      )}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </details>
          ))}
        </nav>

        <form action={logout} data-no-action-confirmation="true" className="mt-6 shrink-0 border-t border-slate-200 pt-4">
          <button className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-ink">
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Logout
          </button>
        </form>
      </aside>

      <div className="lg:pl-72">
        <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              CV Tajuk
              {userRole && (
                <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand ring-1 ring-inset ring-blue-200">
                  {userRole}
                </span>
              )}
            </Link>
            <BarChart3 aria-hidden="true" className="h-5 w-5 text-brand" />
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Mobile navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = isNavigationItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={clsx(
                    "flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm",
                    isActive
                      ? "border-brand bg-brand text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              );
            })}
            <form action={logout} data-no-action-confirmation="true">
              <button title="Logout" className="flex h-10 min-w-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600">
                <LogOut aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">Logout</span>
              </button>
            </form>
          </nav>
        </header>

        <main className="app-main print-main mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {children}
        </main>
        <TableEnhancer />
        <CardHelpEnhancer />
        <ActionConfirmationDialog />
        {userId && <NotificationButton notifications={notifications} userId={userId} />}
        <PageHelpButton />
      </div>
    </div>
  );
}
