import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { estadoDelCorreo, olvidarClaveDeResend } from "@/lib/email";

// Guardar la clave de Resend desde la pantalla de Conexiones.
//
// POR QUÉ EXISTE
// La clave vivía solo en una variable de Railway. Eso está bien para quien
// administra el servidor, pero acá quien decide sobre el correo no
// necesariamente tiene ese acceso a mano — y entonces los correos se quedan
// sin salir por un trámite, que es exactamente lo que pasó. Guardada desde
// esta pantalla, se pega y anda, como el token de Notion.
//
// Es del mismo permiso que el resto de las conexiones: acá se cargan los
// secretos de producción.

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Las conexiones son del administrador." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { clave?: string };
  const clave = body.clave?.trim();
  if (!clave) return NextResponse.json({ error: "Falta la clave." }, { status: 400 });

  // Las claves de Resend empiezan con re_. Se chequea para atajar el pegado
  // equivocado —la clave de otro servicio, o el id del dominio— antes de
  // guardarla y quedar esperando correos que no van a salir.
  if (!clave.startsWith("re_")) {
    return NextResponse.json(
      { error: "Esa no parece una clave de Resend: tienen que empezar con «re_»." },
      { status: 400 },
    );
  }

  // Antes de guardarla se prueba contra Resend. Una clave revocada o mal
  // copiada se guarda igual de bien que una buena, y el error recién
  // aparecería mañana, cuando no salga el reporte.
  const prueba = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${clave}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!prueba || !prueba.ok) {
    return NextResponse.json(
      { error: prueba ? `Resend rechazó la clave (${prueba.status}).` : "No se pudo hablar con Resend." },
      { status: 400 },
    );
  }

  // Se cifra sola al guardar: `resendApiKey` está en la lista de secretos de
  // db.ts, igual que el token de Notion.
  await db.organization.update({
    where: { id: session.organizationId },
    data: { resendApiKey: clave },
  });
  olvidarClaveDeResend();

  const estado = await estadoDelCorreo();
  return NextResponse.json({ ok: true, dominio: estado.dominio, dominios: estado.dominios });
}

/** Sacar la clave guardada. */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Las conexiones son del administrador." }, { status: 403 });
  }
  await db.organization.update({
    where: { id: session.organizationId },
    data: { resendApiKey: null },
  });
  olvidarClaveDeResend();
  return NextResponse.json({ ok: true });
}
