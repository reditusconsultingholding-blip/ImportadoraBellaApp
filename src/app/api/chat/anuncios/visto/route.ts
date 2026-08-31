import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";

// "Ya lo vi": la persona acusa el anuncio y deja de saltarle al entrar.
//
// Va aparte de /api/chat/anuncios porque es la única acción que hace cualquier
// persona del equipo, no solo dirección; mezclarla con publicar y retirar
// dejaría una ruta donde dos verbos piden un rol y el tercero no.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "No tienes acceso a los anuncios." }, { status: 403 });
  }

  const { id } = (await req.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "Falta el anuncio." }, { status: 400 });

  // La organización va en el WHERE: sin eso, una id ajena marcaría como visto
  // un anuncio de otra empresa y crearía una fila que no debería existir.
  const anuncio = await db.anuncio.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!anuncio) return NextResponse.json({ error: "Ese anuncio no existe." }, { status: 404 });

  // Upsert y no create: tocar dos veces "Entendido" —o tener la app abierta en
  // dos pestañas— no tiene por qué devolver un error de clave repetida.
  await db.anuncioVisto.upsert({
    where: { anuncioId_userId: { anuncioId: id, userId: session.userId } },
    create: { anuncioId: id, userId: session.userId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}
