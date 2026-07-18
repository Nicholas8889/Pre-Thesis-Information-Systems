import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { verifySignedSession } from "@/lib/session-token";

const publicPaths = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = publicPaths.some((path) => pathname === path);
  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const session = await verifySignedSession(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (isPublicPath && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isPublicPath && !isAuthEndpoint && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(AUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  if (!isPublicPath && !isAuthEndpoint) {
    requestHeaders.set("x-cv-tajuk-protected", "1");
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!isPublicPath && !isAuthEndpoint) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
