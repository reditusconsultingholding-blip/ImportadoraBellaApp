import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { limpiarEtiquetas, mesesTrasEtiqueta } from "@/lib/etiquetas-producto";
import { diaEcuador } from "@/lib/control-publicitario";

// Guarda las etiquetas de un producto (testeo, activo, apagado...). Ver
// src/lib/etiquetas-producto.ts. Las pone dirección: son las que deciden en
// qué sección de riesgo cae un producto.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Las etiquetas las pone dirección." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { productId?: string; etiquetas?: unknown };
  if (!body.productId) return NextResponse.json({ error: "Falta el producto." }, { status: 400 });

  const etiquetas = limpiarEtiquetas(body.etiquetas);
  const antes = await db.product.findFirst({
    where: { id: body.productId, organizationId: session.organizationId },
    select: { etiquetas: true, testeoMeses: true },
  });
  if (!antes) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  // Si ya tiene meses de prueba anotados, poner o quitar Testeo mueve el mes
  // en curso (ver esTesteoEnPeriodo).
  const testeoMeses = mesesTrasEtiqueta(antes, etiquetas, diaEcuador().toISOString().slice(0, 7));
  await db.product.update({ where: { id: body.productId }, data: { etiquetas, testeoMeses } });
  return NextResponse.json({ ok: true, etiquetas });
}
