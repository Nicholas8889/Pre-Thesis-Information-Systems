import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { roleLabel } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
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
  const currentUser = await getCurrentUser();
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
