import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { emailConfigured, sendEmail } from "@/lib/email";
import { frenarUsuario } from "@/lib/limite";

// Un correo de prueba, para confirmar que el dominio quedó verificado.
//
// Existe para cerrar el circuito sin depender de nadie: quien pega la clave en
// Railway puede comprobar en el momento que funciona, en vez de esperar al
// cierre del día para ver si el reporte llegó —y no saber, si no llega, si
// falló el correo o si no había reporte.
//
// Se manda al correo de quien aprieta el botón y a nadie más: probar no debería
// llenarle la bandeja al resto del equipo.

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Manda un correo real: sin tope sirve para spamear y quemar la cuota de Resend.
  const frenado = frenarUsuario("correo-prueba", session.userId, 5, 60 * 60 * 1000);
  if (frenado) return frenado;
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Probar el correo es de dirección." }, { status: 403 });
  }

  if (!(await emailConfigured())) {
    return NextResponse.json(
      { error: "Todavía no hay una clave de Resend cargada en el servidor." },
      { status: 400 },
    );
  }

  const usuario = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true },
  });
  if (!usuario?.email) {
    return NextResponse.json({ error: "Tu cuenta no tiene correo." }, { status: 400 });
  }

  const r = await sendEmail({
    to: [usuario.email],
    subject: "Prueba de correo · Panel Jarvis",
    html:
      `<p>Hola ${usuario.name.split(" ")[0]},</p>` +
      `<p>Si estás leyendo esto, el correo saliente del panel quedó funcionando: ` +
      `el dominio está verificado y la clave de Resend es la correcta.</p>` +
      `<p>Desde ahora pueden salir el reporte diario y los avisos del equipo.</p>`,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ ok: true, destino: usuario.email });
}
