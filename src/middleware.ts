import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
// Se importa del módulo suelto y no de auth.ts: el middleware corre en el
// runtime edge, y auth.ts consulta la base, que ahí no puede correr.
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

// Mismo criterio que auth.ts: en producción no hay clave de repuesto. Con la
// de desarrollo —que está en el código— cualquiera podría fabricar una cookie
// que el middleware diera por buena. Sin la variable, nadie pasa.
function secret(): Uint8Array | null {
  const v = process.env.SESSION_SECRET;
  if (v) return new TextEncoder().encode(v);
  if (process.env.NODE_ENV === "production") return null;
  return new TextEncoder().encode("dev-only-secret-change-me");
}

const MUTACIONES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Hosts desde los que se aceptan pedidos que cambian datos.
function hostsPropios(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const h = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (h) hosts.add(h.toLowerCase());
  hosts.add(req.nextUrl.host.toLowerCase());
  const app = process.env.APP_URL;
  if (app) {
    try {
      hosts.add(new URL(app).host.toLowerCase());
    } catch {}
  }
  return hosts;
}

/**
 * Freno a CSRF en la API: un pedido que cambia datos tiene que venir de la
 * propia aplicación.
 *
 * La cookie ya es SameSite=Lax, que frena la mayoría de los casos; esto es la
 * segunda capa, por si un navegador viejo no respeta SameSite o si algún día
 * la cookie cambia. Los navegadores mandan Origin en todo POST/PUT/PATCH/
 * DELETE; si viene de otro sitio, se corta. Sin Origin (curl, el cron
 * externo, un servidor) se deja pasar: esos no llevan la cookie de nadie.
 */
function origenAjeno(req: NextRequest): boolean {
  if (!MUTACIONES.has(req.method)) return false;
  // El cron se autentica con su secreto, no con la cookie.
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return false;

  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return !hostsPropios(req).has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (origenAjeno(req)) {
      return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const clave = secret();

  let authenticated = false;
  let mustChangePassword = false;
  if (token && clave) {
    try {
      const { payload } = await jwtVerify(token, clave);
      authenticated = true;
      mustChangePassword = Boolean(payload.mustChangePassword);
    } catch {
      authenticated = false;
    }
  }

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
  matcher: ["/dashboard/:path*", "/login", "/cambiar-clave", "/api/:path*"],
};
