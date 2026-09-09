import { NextRequest, NextResponse } from "next/server";

import { PROTECTED_PATH_PREFIXES, SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { getSessionSecret } from "@/server/auth/secrets";
import { verifySessionToken } from "@/server/auth/session";

function isProtectedPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/api") && pathname !== "/api/health") return true;
  return PROTECTED_PATH_PREFIXES.some((prefix) => prefix !== "/" && pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token, getSessionSecret());

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedPath(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health).*)"]
};
