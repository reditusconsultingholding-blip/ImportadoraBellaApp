import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

const COOKIE_NAME = SESSION_COOKIE_NAME;

// Sin SESSION_SECRET las cookies quedarían firmadas con una clave que
// cualquiera que lea el código conoce: en producción eso permitiría fabricar
// una sesión de administrador. Se corta el arranque antes de que eso pase.
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta SESSION_SECRET. Sin eso las sesiones serían falsificables.");
    }
    return new TextEncoder().encode("dev-only-secret-change-me");
  }
  return new TextEncoder().encode(value);
}

export type SessionPayload = {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: "OWNER" | "DIRECTOR" | "EDITOR" | "PENDING";
  mustChangePassword: boolean;
};

export async function createSession(payload: SessionPayload) {
  // La versión de sesión vigente del usuario viaja en la cookie. Ver
  // User.sessionVersion: cuando cambia, las cookies anteriores dejan de valer.
  const u = await db.user.findUnique({
    where: { id: payload.userId },
    select: { sessionVersion: true },
  });
  const token = await new SignJWT({ ...payload, sv: u?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// La cookie prueba QUIÉN es, pero no QUÉ puede hacer hoy: el rol, la
// organización y hasta la existencia de la cuenta se releen de la base en cada
// pedido. Sin esto, bajarle el rol a alguien o borrarle la cuenta no tendría
// efecto hasta que se le venciera el token, que dura 30 días.
//
// Una sola lectura del usuario por pedido. El layout, la página y los chequeos
// de permisos (ver cifras, nómina) pedían cada uno su fila de User: tres o
// cuatro viajes a la base antes de empezar a calcular nada. `cache` de React
// la comparte dentro del mismo render; en una ruta de API no aplica y lee
// normalmente.
export const usuarioConPermisos = cache(async (userId: string) =>
  db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
      sessionVersion: true,
      canViewPayroll: true,
      canViewFinancials: true,
      avatarUrl: true,
      capacitacionVista: true,
      capacitacionAperturas: true,
    },
  }),
);

export const getSession = cache(async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  let version: number;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = (payload as { userId?: string }).userId ?? "";
    // Las cookies de antes de este cambio no traen versión: valen como 0,
    // que es el valor inicial, así que nadie queda afuera al desplegar.
    version = (payload as { sv?: number }).sv ?? 0;
    if (!userId) return null;
  } catch {
    return null;
  }

  const user = await usuarioConPermisos(userId);
  if (!user) return null;
  // La clave cambió después de emitida esta cookie: sesión revocada.
  if (user.sessionVersion !== version) return null;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
});

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { SESSION_COOKIE_NAME };
