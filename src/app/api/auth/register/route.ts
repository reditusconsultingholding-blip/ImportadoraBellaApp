import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { totpConfigured, verifyTotpCode } from "@/lib/totp";

// Registro público. La única barrera es el código de autorización rotativo que
// ven los administradores en Mi perfil — que era la idea original: "para que el
// que consiga el link no se pueda registrar sin el código" (ver DECISIONES.md).
//
// Quien se registra entra con rol PENDING: puede iniciar sesión, pero no ve
// nada del negocio hasta que un administrador le asigne el rol desde Usuarios.
// Sin eso, cualquiera con el código de hoy tendría acceso a las ventas.

// Mismo freno que el login: sin esto, el código de 6 dígitos se puede adivinar
// probando. Un millón de combinaciones y 30 segundos de vigencia hacen que sea
// improbable, pero improbable no es imposible si se prueba sin límite.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 30 * 60 * 1000;

type Attempt = { count: number; first: number; lockedUntil?: number };
const attempts = new Map<string, Attempt>();

function clientKey(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "sin-ip"
  );
}

function blocked(key: string) {
  const entry = attempts.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return Math.ceil((entry.lockedUntil - now) / 60000);
  }
  if (now - entry.first > WINDOW_MS) attempts.delete(key);
  return 0;
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

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  const wait = blocked(key);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Demasiados intentos. Prueba de nuevo en ${wait} minutos.` },
      { status: 429 }
    );
  }

  const { name, email, password, authCode } = (await req.json()) as {
    name?: string;
    email?: string;
    password?: string;
    authCode?: string;
  };

  const cleanName = name?.trim();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanName || cleanName.length < 2) {
    return NextResponse.json({ error: "Escribe tu nombre completo." }, { status: 400 });
  }
  if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  // El código se valida ANTES de mirar si el correo existe: si no, probando
  // correos sin código se podría averiguar quién tiene cuenta.
  const typed = authCode?.trim() ?? "";
  const fixedCode = process.env.USER_CREATION_CODE?.trim();
  const codeOk = totpConfigured()
    ? verifyTotpCode(typed)
    : fixedCode
      ? typed === fixedCode
      : typed === "190300";

  if (!codeOk) {
    registerFailure(key);
    return NextResponse.json({ error: "Código de autorización incorrecto." }, { status: 403 });
  }

  const existing = await db.user.findUnique({ where: { email: cleanEmail } });
  if (existing) {
    return NextResponse.json({ error: "Ya hay una cuenta con ese correo." }, { status: 409 });
  }

  // Toda la gente entra a la misma organización. Cuando haya más clientes esto
  // va a necesitar un código por organización, no uno solo.
  const organization = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) {
    return NextResponse.json({ error: "No hay una organización configurada." }, { status: 500 });
  }

  const user = await db.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 10),
      // PENDING a propósito: entra, pero no ve nada hasta que le den el rol.
      role: "PENDING",
      mustChangePassword: false,
      organizationId: organization.id,
    },
  });

  // Se avisa a los administradores para que le asignen el rol; si no, la
  // persona queda esperando sin que nadie se entere.
  const owners = await db.user.findMany({
    where: { organizationId: organization.id, role: "OWNER" },
    select: { id: true },
  });
  if (owners.length > 0) {
    await db.notification.createMany({
      data: owners.map((owner) => ({
        userId: owner.id,
        type: "mention",
        message: `${cleanName} creó una cuenta y está esperando que le asignes un rol.`,
        link: "/dashboard/usuarios",
      })),
    });
  }

  await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: false,
  });

  return NextResponse.json({ ok: true });
}
