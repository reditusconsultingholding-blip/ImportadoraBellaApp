import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Sumar a alguien al equipo de contenido, desde Rendimiento.
//
// EL PROBLEMA QUE RESUELVE
// En el día a día cada quien escribe el nombre del responsable a mano. Cuando
// ese nombre no es el de ningún usuario —porque entró alguien nuevo, o porque
// la llaman "MAJO" y en el sistema es "María José"— su trabajo no se le suma a
// nadie: aparece en cero con ciento setenta tareas cargadas. Emilia lo dijo
// así: "tenemos una integrante nueva y no aparece en rendimiento, no sabría
// cómo hacer para integrarla".
//
// La solución existía, pero escondida: había que irse a Usuarios, editar a la
// persona y escribir el apodo en un campo. Tres pantallas para arreglar algo
// que se ve desde acá.
//
// DOS CASOS DISTINTOS, Y SE PARECEN
//   1. La persona YA tiene cuenta y la llaman de otra forma  → se anota el
//      apodo. Lo puede hacer dirección, porque no toca credenciales.
//   2. La persona NO tiene cuenta                            → hay que crearla.
//      Eso sigue siendo solo del dueño: es una cuenta con acceso a la
//      herramienta, no una etiqueta.

/** Lista para el desplegable: a quién se le puede colgar un nombre suelto. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const usuarios = await db.user.findMany({
    where: { organizationId: session.organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
    select: { id: true, name: true, role: true, apodos: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ usuarios, puedeCrear: session.role === "OWNER" });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    nombre?: string;
    userId?: string;
    email?: string;
    rol?: string;
  };

  const nombre = body.nombre?.trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });

  /* ---- Caso 1: el nombre es de alguien que ya está ---- */
  if (body.userId) {
    const persona = await db.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, apodos: true, organizationId: true },
    });
    if (!persona || persona.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Esa persona no existe." }, { status: 404 });
    }

    // Sin repetidos y sin distinguir mayúsculas: el tablero trae "ANA",
    // "Ana" y "anita" como si fueran tres personas.
    const yaEsta = [persona.name, ...persona.apodos].some(
      (a) => a.trim().toLowerCase() === nombre.toLowerCase(),
    );
    if (yaEsta) {
      return NextResponse.json({ ok: true, nombre: persona.name, sinCambios: true });
    }

    const apodos = [...persona.apodos, nombre].slice(0, 10);
    await db.user.update({ where: { id: persona.id }, data: { apodos } });
    return NextResponse.json({ ok: true, nombre: persona.name });
  }

  /* ---- Caso 2: hay que crearle la cuenta ---- */
  if (session.role !== "OWNER") {
    return NextResponse.json(
      {
        error:
          "Crear una cuenta nueva es del administrador. Si la persona ya tiene cuenta, elegila de la lista y queda enlazada.",
      },
      { status: 403 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Hace falta un correo válido." }, { status: 400 });
  }
  const tomado = await db.user.findUnique({ where: { email } });
  if (tomado) return NextResponse.json({ error: "Ya hay una cuenta con ese correo." }, { status: 409 });

  const rol = body.rol === "DIRECTOR" ? "DIRECTOR" : "EDITOR";

  // Una clave temporal que se muestra UNA vez y que la persona cambia al
  // entrar. Es mejor que pedirle a quien está creando la cuenta que invente
  // una y termine poniendo la misma para todo el equipo.
  const temporal = `bella-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}`;

  const creada = await db.user.create({
    data: {
      email,
      name: nombre,
      passwordHash: await bcrypt.hash(temporal, 10),
      role: rol,
      organizationId: session.organizationId,
      mustChangePassword: true,
      // El nombre con el que ya venía apareciendo en el tablero queda como
      // apodo: así el trabajo que cargó antes de tener cuenta se le cuenta
      // desde el primer día.
      apodos: [nombre],
    },
    select: { id: true, name: true },
  });

  return NextResponse.json({ ok: true, creada: true, nombre: creada.name, claveTemporal: temporal });
}
