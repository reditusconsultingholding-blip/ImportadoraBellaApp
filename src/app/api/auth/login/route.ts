import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

// Freno a la fuerza bruta. Sin esto, con el correo de alguien del equipo (que
// es público: nombre.apellido@bellacorp.store) se pueden probar contraseñas
// sin límite hasta acertar.
//
// Vive en memoria del proceso a propósito: es una defensa de primera línea,
// no un candado perfecto. Se pierde en cada reinicio y no se comparte entre
// instancias — si algún día la app corre en varias, esto tiene que pasar a la
// base o a Redis.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

type Attempt = { count: number; first: number; lockedUntil?: number };
const attempts = new Map<string, Attempt>();

function keyFor(req: NextRequest, email: string) {
  // Se cuenta por IP + correo: así un atacante no bloquea la cuenta de otro
  // fallando adrede desde afuera, y tampoco le sirve rotar el correo.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "sin-ip";
  return `${ip}|${email.toLowerCase()}`;
}

function check(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return { blocked: false as const };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { blocked: true as const, retryInMin: Math.ceil((entry.lockedUntil - now) / 60000) };
  }
  if (now - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return { blocked: false as const };
  }
  return { blocked: false as const };
}

function registerFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS;
}

// La tabla se limpia sola cuando crece: sin esto sería una fuga de memoria
// lenta en un proceso de larga vida.
function sweep() {
  if (attempts.size < 5000) return;
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if ((entry.lockedUntil ?? entry.first + WINDOW_MS) < now) attempts.delete(key);
  }
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Faltan credenciales." }, { status: 400 });
  }

  sweep();
  const key = keyFor(req, email);
  const gate = check(key);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Probá de nuevo en ${gate.retryInMin} minuto${
          gate.retryInMin === 1 ? "" : "s"
        }.`,
      },
      { status: 429 }
    );
  }

  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Mismo mensaje y mismo costo tanto si el correo no existe como si la
  // contraseña está mal: responder distinto delataría qué correos son cuentas
  // reales. Por eso se compara igual contra un hash de descarte.
  const hash = user?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    registerFailure(key);
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  attempts.delete(key);

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });

  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
}
