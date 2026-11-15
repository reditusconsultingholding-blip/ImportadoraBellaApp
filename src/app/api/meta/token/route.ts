import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { cuentasDelToken } from "@/lib/integrations/meta-directo";
import { mensajeSeguro } from "@/lib/respuesta";

// Guardar el token de Meta directo desde Conexiones (meta-directo.ts).
//
// Antes de guardarlo se prueba: se le pide a Meta la lista de cuentas que ve.
// Un token mal copiado, sin `ads_read` o sin cuentas asignadas se guardaría
// igual de bien que uno bueno, y Meta se quedaría sin datos en silencio.

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Las conexiones son del administrador." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: "Falta el token." }, { status: 400 });

  let cuentas;
  try {
    cuentas = await cuentasDelToken(token);
  } catch (e) {
    return NextResponse.json({ error: mensajeSeguro(e, "Meta rechazó el token.") }, { status: 400 });
  }
  if (cuentas.length === 0) {
    return NextResponse.json(
      {
        error:
          "El token es válido pero no ve ninguna cuenta publicitaria. En el Business Manager, asígnale las cuentas al usuario del sistema.",
      },
      { status: 400 },
    );
  }

  // Se cifra sola al guardar: `token` de MetaConnection está en db.ts.
  await db.metaConnection.upsert({
    where: { organizationId: session.organizationId },
    create: { organizationId: session.organizationId, token, cuentas: cuentas.length, connectedAt: new Date() },
    update: { token, cuentas: cuentas.length, connectedAt: new Date() },
  });

  return NextResponse.json({ ok: true, cuentas: cuentas.map((c) => c.nombre) });
}

/** Volver a Windsor: se borra el token y Meta vuelve a leerse por ahí. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Las conexiones son del administrador." }, { status: 403 });
  }
  await db.metaConnection.deleteMany({ where: { organizationId: session.organizationId } });
  return NextResponse.json({ ok: true });
}
