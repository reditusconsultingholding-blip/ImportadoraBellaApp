import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Cualquiera puede escribir en los canales, pero crearlos es de quien
  // coordina: si no, en un mes hay treinta canales muertos.
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tienes permiso para crear canales." }, { status: 403 });
  }

  const { name } = (await req.json()) as { name?: string };
  const clean = name?.trim();
  if (!clean || clean.length < 2) {
    return NextResponse.json({ error: "Ponle un nombre al canal." }, { status: 400 });
  }

  const slug = slugify(clean);
  if (!slug) {
    return NextResponse.json({ error: "Ese nombre no sirve como canal." }, { status: 400 });
  }

  const existing = await db.chatChannel.findUnique({
    where: { organizationId_slug: { organizationId: session.organizationId, slug } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un canal con ese nombre." }, { status: 409 });
  }

  const channel = await db.chatChannel.create({
    data: { organizationId: session.organizationId, slug, name: clean },
  });

  return NextResponse.json({ ok: true, id: channel.id, name: channel.name });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Borrar es más grave que crear: se lleva puesto todo el historial del
  // canal, así que queda solo en dirección.
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tienes permiso para borrar canales." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el canal." }, { status: 400 });

  const channel = await db.chatChannel.findUnique({
    where: { id },
    select: { id: true, name: true, organizationId: true, _count: { select: { messages: true } } },
  });
  if (!channel || channel.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  // Los mensajes y los anclados caen por cascada (onDelete: Cascade). Se
  // devuelve cuántos eran para que la pantalla pueda decirlo y nadie borre
  // seis meses de conversación creyendo que era un canal vacío.
  await db.chatChannel.delete({ where: { id } });

  return NextResponse.json({
    ok: true,
    name: channel.name,
    mensajesBorrados: channel._count.messages,
  });
}
