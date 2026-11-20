import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { avisarA } from "@/lib/push";
import { esEstado, textoDeEstado, textoDeTipo, LARGO_MAXIMO } from "@/lib/propuestas";

// Dirección marca el estado de una propuesta y le responde a quien la mandó.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Las propuestas las responde dirección." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { estado?: unknown; respuesta?: unknown };

  const actual = await db.propuestaEquipo.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!actual) return NextResponse.json({ error: "No la encuentro." }, { status: 404 });

  const estado = body.estado === undefined ? actual.estado : body.estado;
  if (!esEstado(estado)) return NextResponse.json({ error: "Estado no válido." }, { status: 400 });
  const respuesta =
    typeof body.respuesta === "string" ? body.respuesta.trim().slice(0, LARGO_MAXIMO) || null : actual.respuesta;

  const respuestaNueva = respuesta !== actual.respuesta && respuesta;
  const p = await db.propuestaEquipo.update({
    where: { id },
    data: {
      estado,
      respuesta,
      ...(respuestaNueva || estado !== actual.estado ? { respondidoPor: session.userId, respondidoEn: new Date() } : {}),
    },
  });

  // Le avisa a quien la mandó cuando hay respuesta o cambia el estado.
  if (actual.userId !== session.userId && (respuestaNueva || estado !== actual.estado)) {
    try {
      const mensaje = respuestaNueva
        ? `${session.name} respondió tu ${textoDeTipo(actual.tipo).toLowerCase()}: «${respuesta!.slice(0, 160)}»`
        : `Tu ${textoDeTipo(actual.tipo).toLowerCase()} quedó como «${textoDeEstado(estado)}».`;
      const link = `/dashboard/propuestas?abrir=${id}`;
      await db.notification.create({ data: { userId: actual.userId, type: "propuesta", message: mensaje, link } });
      await avisarA(actual.userId, { titulo: "Respuesta a tu propuesta", cuerpo: mensaje, url: link, etiqueta: "propuesta" });
    } catch (err) {
      console.error("[propuestas] aviso", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ ok: true, propuesta: p });
}
