import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signSession, verifySignedSession } from "@/lib/session-token";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type SessionUser = {
  id: string;
  username: string;
  role: UserRole;
};

export async function createSession(user: SessionUser) {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const value = await signSession({
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(expiresAt.getTime() / 1000)
  });
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: expiresAt
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0)
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySignedSession(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true
    }
  });

  if (
    !user ||
    user.status !== "Active" ||
    user.username !== session.username ||
    user.role !== session.role
  ) {
    return null;
  }

  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
