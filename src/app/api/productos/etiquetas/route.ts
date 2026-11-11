import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { limpiarEtiquetas } from "@/lib/etiquetas-producto";

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
  const r = await db.product.updateMany({
    where: { id: body.productId, organizationId: session.organizationId },
    data: { etiquetas },
  });
  if (r.count === 0) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, etiquetas });
}
