import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";

// Banco de referencias: lo que se encuentra afuera y sirve de punto de partida.
//
// Guardar también las ANTI-referencias importa igual que las buenas: saber qué
// no funcionó evita repetirlo, y esa es la mitad del aprendizaje que hoy se
// pierde en la cabeza de quien lo probó.

function urlValida(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const productId = req.nextUrl.searchParams.get("productId");

  const referencias = await db.referencia.findMany({
    where: {
      organizationId: session.organizationId,
      ...(productId ? { productId } : {}),
    },
    orderBy: { fecha: "desc" },
    take: 300,
    select: {
      id: true,
      fecha: true,
      codigo: true,
      mercadoOrigen: true,
      antiguedadDias: true,
      fuente: true,
      formatoVisual: true,
      angulo: true,
      awarenessLevel: true,
      concepto: true,
      antiReferencia: true,
      link: true,
      estado: true,
      product: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ referencias, puedeEditar: canManagePipeline(session.role) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const b = (await req.json()) as Record<string, string | number | boolean | null | undefined>;

  const codigo = String(b.codigo ?? "").trim();
  const concepto = String(b.concepto ?? "").trim();
  if (!codigo && !concepto) {
    return NextResponse.json(
      { error: "Ponle al menos un nombre o el concepto que rescatas." },
      { status: 400 }
    );
  }

  const link = String(b.link ?? "").trim();
  if (link && !urlValida(link)) {
    return NextResponse.json(
      { error: "El link tiene que empezar con http:// o https://." },
      { status: 400 }
    );
  }

  // El producto es opcional: una referencia puede servir para varios, o para
  // ninguno todavía.
  let productId: string | null = null;
  if (b.productId) {
    const p = await db.product.findUnique({
      where: { id: String(b.productId) },
      select: { id: true, organizationId: true },
    });
    if (p && p.organizationId === session.organizationId) productId = p.id;
  }

  const antiguedad = Number(b.antiguedadDias);

  const referencia = await db.referencia.create({
    data: {
      organizationId: session.organizationId,
      productId,
      fecha: b.fecha ? new Date(`${String(b.fecha)}T12:00:00.000Z`) : new Date(),
      codigo: codigo || null,
      mercadoOrigen: String(b.mercadoOrigen ?? "").trim() || null,
      antiguedadDias: Number.isFinite(antiguedad) && antiguedad >= 0 ? Math.round(antiguedad) : null,
      fuente: String(b.fuente ?? "").trim() || null,
      formatoVisual: String(b.formatoVisual ?? "").trim() || null,
      angulo: String(b.angulo ?? "").trim() || null,
      awarenessLevel: String(b.awarenessLevel ?? "").trim() || null,
      concepto: concepto || null,
      antiReferencia: Boolean(b.antiReferencia),
      link: link || null,
      estado: String(b.estado ?? "").trim() || null,
      createdById: session.userId,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: referencia.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id, campo, valor } = (await req.json()) as {
    id?: string;
    campo?: string;
    valor?: string | boolean | null;
  };

  const EDITABLES = new Set([
    "codigo",
    "mercadoOrigen",
    "antiguedadDias",
    "fuente",
    "formatoVisual",
    "angulo",
    "awarenessLevel",
    "concepto",
    "antiReferencia",
    "link",
    "estado",
  ]);

  if (!id || !campo || !EDITABLES.has(campo)) {
    return NextResponse.json({ error: "Campo no editable." }, { status: 400 });
  }

  const existente = await db.referencia.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!existente || existente.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Esa referencia no existe." }, { status: 404 });
  }

  if (campo === "link" && typeof valor === "string" && valor.trim() && !urlValida(valor.trim())) {
    return NextResponse.json(
      { error: "El link tiene que empezar con http:// o https://." },
      { status: 400 }
    );
  }

  const dato: Record<string, unknown> =
    campo === "antiReferencia"
      ? { antiReferencia: Boolean(valor) }
      : campo === "antiguedadDias"
        ? {
            antiguedadDias:
              valor === "" || valor == null ? null : Math.round(Number(valor)) || null,
          }
        : { [campo]: typeof valor === "string" && valor.trim() ? valor.trim() : null };

  await db.referencia.update({ where: { id }, data: dato });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta la referencia." }, { status: 400 });

  const ref = await db.referencia.findUnique({
    where: { id },
    select: { id: true, organizationId: true, createdById: true },
  });
  if (!ref || ref.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Esa referencia no existe." }, { status: 404 });
  }
  if (ref.createdById !== session.userId && !canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Esa referencia no la subiste tú." }, { status: 403 });
  }

  await db.referencia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
