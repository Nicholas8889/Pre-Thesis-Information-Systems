import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { roleLabel } from "@/lib/auth";
import { getCurrentUser, requireCurrentUser } from "@/lib/session";
import { getRoleNotifications } from "@/lib/notifications";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "CV Tajuk Revenue Cycle MVP",
  description: "Local thesis MVP for CV Tajuk revenue cycle workflows."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const currentUser =
    requestHeaders.get("x-cv-tajuk-protected") === "1"
      ? await requireCurrentUser()
      : await getCurrentUser();
  const currentRole = currentUser ? roleLabel(currentUser.role) : undefined;
  const notifications = currentUser ? await getRoleNotifications(currentUser) : [];

  return (
    <html lang="en">
      <body>
        <AppShell
          userId={currentUser?.id}
          userRole={currentRole}
          notifications={notifications}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
