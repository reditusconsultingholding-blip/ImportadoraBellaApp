import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { normalizarNombre } from "@/lib/enlace-shopify";
import { programarRecalculo } from "@/lib/control-relleno";

// Marcar un nombre de línea de pedido como "no es un producto" o como testeo.
//
// "ignorar" es para lo que viaja dentro de otro pedido: el envío prioritario,
// la garantía. "testeo" es un producto en prueba: su pauta es costo, sus
// ventas no entran en los pedidos del mes. Las dos cosas cambian el número de
// pedidos, así que piden el mismo permiso que enlazar.

const MOTIVOS = new Set(["ignorar", "testeo"]);

async function autorizar() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return { error: NextResponse.json({ error: "Enlazar productos es de dirección." }, { status: 403 }) };
  }
  return { session };
}

export async function POST(req: NextRequest) {
  const { session, error } = await autorizar();
  if (error) return error;

  const body = (await req.json()) as { nombre?: string; motivo?: string };
  const nombre = body.nombre?.trim();
  const motivo = body.motivo?.trim() ?? "";
  if (!nombre || !MOTIVOS.has(motivo)) {
    return NextResponse.json({ error: "Falta el nombre o el motivo." }, { status: 400 });
  }
  const nombreNorm = normalizarNombre(nombre);
  if (!nombreNorm) return NextResponse.json({ error: "Ese nombre queda vacío." }, { status: 400 });

  // Un nombre está en un solo lugar: si estaba enlazado a un producto, marcarlo
  // como "no es producto" lo desenlaza. Si no, quedaría contando en dos sitios.
  await db.productoShopify.deleteMany({ where: { organizationId: session!.organizationId, nombreNorm } });
  const excluido = await db.nombreShopifyExcluido.upsert({
    where: { organizationId_nombreNorm: { organizationId: session!.organizationId, nombreNorm } },
    create: { organizationId: session!.organizationId, nombre, nombreNorm, motivo },
    update: { motivo },
  });
  // La historia de ese nombre cambia de fila: se recalculan los cierres.
  programarRecalculo(session!.organizationId);
  return NextResponse.json({ excluido });
}

export async function DELETE(req: NextRequest) {
  const { session, error } = await autorizar();
  if (error) return error;
  const nombre = req.nextUrl.searchParams.get("nombre")?.trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  await db.nombreShopifyExcluido.deleteMany({
    where: { organizationId: session!.organizationId, nombreNorm: normalizarNombre(nombre) },
  });
  // La historia de ese nombre cambia de fila: se recalculan los cierres.
  programarRecalculo(session!.organizationId);
  return NextResponse.json({ ok: true });
}
