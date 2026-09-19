import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { contar, excedido, ipDe } from "@/lib/limite";
import { z } from "zod";
import { leerCuerpo } from "@/lib/validacion";
import { contextoDelPedido, registrarActividad } from "@/lib/actividad";

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
// Fallos por IP entre todos los correos. Holgado a propósito: el equipo entero
// puede salir por la misma red de la oficina.
const IP_MAX_FALLOS = 40;

type Attempt = { count: number; first: number; lockedUntil?: number };
const attempts = new Map<string, Attempt>();

function keyFor(req: NextRequest, email: string) {
  // Se cuenta por IP + correo: así un atacante no bloquea la cuenta de otro
  // fallando adrede desde afuera, y tampoco le sirve rotar el correo.
  return `${ipDe(req)}|${email.toLowerCase()}`;
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
  const lectura = await leerCuerpo(
    req,
    z.object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(200) }),
  );
  if (!lectura.ok) {
    return NextResponse.json({ error: "Faltan credenciales." }, { status: 400 });
  }
  const { email, password } = lectura.datos;

  sweep();

  // Además del freno por IP + correo, uno por IP sola: sin él, desde una
  // misma IP se podía probar una clave común contra todos los correos del
  // equipo (8 intentos por cada uno, sin tope total).
  const claveIp = `login-ip|${ipDe(req)}`;
  if (excedido(claveIp, IP_MAX_FALLOS, WINDOW_MS)) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos desde esta conexión. Prueba de nuevo en 10 minutos." },
      { status: 429 }
    );
  }

  const key = keyFor(req, email);
  const gate = check(key);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Prueba de nuevo en ${gate.retryInMin} minuto${
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
    contar(claveIp, IP_MAX_FALLOS, WINDOW_MS);
    // Un intento fallido contra una cuenta real queda en su seguimiento: es
    // la señal de que alguien está probando su clave.
    if (user) {
      registrarActividad({
        organizationId: user.organizationId,
        userId: user.id,
        tipo: "login_fallido",
        ruta: "/login",
        detalle: "Clave incorrecta",
        ...(await contextoDelPedido()),
      });
    }
    return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
  }

  attempts.delete(key);

  registrarActividad({
    organizationId: user.organizationId,
    userId: user.id,
    tipo: "entrada",
    ruta: "/login",
    ...(await contextoDelPedido()),
  });

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
