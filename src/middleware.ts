import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

const secret = () =>
  new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-only-secret-change-me");

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  let authenticated = false;
  let mustChangePassword = false;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      authenticated = true;
      mustChangePassword = Boolean(payload.mustChangePassword);
    } catch {
      authenticated = false;
    }
  }

  const { pathname } = req.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isLoginRoute = pathname === "/login";
  const isChangePasswordRoute = pathname === "/cambiar-clave";

  if ((isDashboardRoute || isChangePasswordRoute) && !authenticated) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (isDashboardRoute && mustChangePassword) {
    return NextResponse.redirect(new URL("/cambiar-clave", req.url));
  }
  if (isLoginRoute && authenticated) {
    return NextResponse.redirect(new URL(mustChangePassword ? "/cambiar-clave" : "/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/cambiar-clave"],
};
