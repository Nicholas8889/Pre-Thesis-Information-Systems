"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, X } from "lucide-react";
import type { AppNotification } from "@/lib/notifications";
import { getUnreadNotificationIds } from "@/lib/notification-state";

export function NotificationButton({
  notifications,
  userId
}: {
  notifications: AppNotification[];
  userId: string;
}) {
  const storageKey = `cv_tajuk_read_notifications_${userId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
        setReadIds(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []);
      } catch {
        setReadIds([]);
      }
      setIsReady(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [storageKey]);

  const unreadIds = useMemo(
    () => getUnreadNotificationIds(notifications, readIds),
    [notifications, readIds]
  );
  const hasUnread = isReady && unreadIds.length > 0;

  function openNotifications() {
    setIsOpen(true);
    if (unreadIds.length === 0) return;
    const nextReadIds = [...new Set([...readIds, ...unreadIds])];
    setReadIds(nextReadIds);
    localStorage.setItem(storageKey, JSON.stringify(nextReadIds));
  }

  return (
    <>
      <button
        type="button"
        onClick={openNotifications}
        className="no-print fixed bottom-4 right-[4.75rem] z-40 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-brand shadow-soft transition hover:bg-slate-50 sm:bottom-5 sm:right-[7.25rem] sm:px-4"
        title="Notifications"
      >
        <span className="relative">
          <Bell aria-hidden="true" className="h-4 w-4" />
          {hasUnread && (
            <span
              className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-white"
              aria-label={`${unreadIds.length} unread notification(s)`}
            />
          )}
        </span>
        <span className="hidden sm:inline">Notifications</span>
      </button>

      {isOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-end bg-slate-900/20 p-3 sm:p-6">
          <section className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-hidden rounded-md border border-slate-200 bg-white shadow-soft sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Reminder Center</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">Notifications</h2>
                <p className="mt-1 text-sm text-slate-500">{notifications.length} reminder(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-ink"
                title="Close notifications"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Bell aria-hidden="true" className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-600">No notifications right now.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {notifications.map((notification) => (
                    <Link
                      key={notification.id}
                      href={notification.href}
                      onClick={() => setIsOpen(false)}
                      className="block px-5 py-4 transition hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-ink">{notification.title}</h3>
                          <p className="mt-1 text-sm leading-5 text-slate-600">{notification.description}</p>
                          <p className="mt-2 text-xs font-medium text-slate-400">
                            Sent {formatNotificationDate(notification.sentAt)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}
