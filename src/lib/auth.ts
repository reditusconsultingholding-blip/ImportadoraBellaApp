import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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
  const token = await new SignJWT(payload)
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
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = (payload as { userId?: string }).userId ?? "";
    if (!userId) return null;
  } catch {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
    },
  });
  if (!user) return null;

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { SESSION_COOKIE_NAME };
