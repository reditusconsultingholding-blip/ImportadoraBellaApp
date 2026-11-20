import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { avisarAVarios } from "@/lib/push";
import { limpiarPropuesta, textoDeTipo } from "@/lib/propuestas";

// El buzón del equipo (ver src/lib/propuestas.ts).
//
// GET: dirección ve todas; el resto, solo las suyas con la respuesta.
// POST: cualquiera con acceso al panel manda una; le llega a dirección.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });

  const todas = canManagePipeline(session.role);
  const propuestas = await db.propuestaEquipo.findMany({
    where: { organizationId: session.organizationId, ...(todas ? {} : { userId: session.userId }) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const ids = [...new Set(propuestas.flatMap((p) => [p.userId, p.respondidoPor].filter(Boolean) as string[]))];
  const gente = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nombre = new Map(gente.map((u) => [u.id, u.name]));
  return NextResponse.json({
    todas,
    propuestas: propuestas.map((p) => ({
      ...p,
      autor: nombre.get(p.userId) ?? "Alguien del equipo",
      respondio: p.respondidoPor ? (nombre.get(p.respondidoPor) ?? null) : null,
      mia: p.userId === session.userId,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) return NextResponse.json({ error: "Sin permiso." }, { status: 403 });

  const r = limpiarPropuesta(await req.json().catch(() => null));
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });

  const p = await db.propuestaEquipo.create({
    data: { ...r.ok, organizationId: session.organizationId, userId: session.userId },
  });

  // A dirección, menos a quien la mandó.
  try {
    const direccion = await db.user.findMany({
      where: { organizationId: session.organizationId, role: { in: ["OWNER", "DIRECTOR"] }, id: { not: session.userId } },
      select: { id: true },
    });
    const resumen = r.ok.texto.length > 140 ? `${r.ok.texto.slice(0, 137)}…` : r.ok.texto;
    const mensaje = `${session.name} mandó una ${textoDeTipo(r.ok.tipo).toLowerCase()}${r.ok.seccion ? ` sobre ${r.ok.seccion}` : ""}: «${resumen}»`;
    const link = `/dashboard/propuestas?abrir=${p.id}`;
    if (direccion.length) {
      await db.notification.createMany({
        data: direccion.map((u) => ({ userId: u.id, type: "propuesta", message: mensaje, link })),
      });
      await avisarAVarios(
        direccion.map((u) => u.id),
        { titulo: "Propuesta del equipo", cuerpo: mensaje, url: link, etiqueta: "propuesta" },
      );
    }
  } catch (err) {
    // La propuesta ya quedó guardada: un aviso caído no la pierde.
    console.error("[propuestas] aviso", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, id: p.id });
}
