import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Quiénes llevan un producto.
//
// Los asigna dirección. Son los únicos del equipo que ven y cargan las piezas
// de ese producto, y a quienes el aviso de las ocho les reclama las piezas sin
// clasificar. Se reemplaza la lista entera en cada guardado: es una elección
// de dos o tres personas, no un historial.

async function productoDe(code: string, organizationId: string) {
  return db.product.findFirst({
    where: { code: decodeURIComponent(code), organizationId },
    select: { id: true },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Asignar responsables es de dirección." }, { status: 403 });
  }

  const { code } = await params;
  const producto = await productoDe(code, session.organizationId);
  if (!producto) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const body = (await req.json()) as { userIds?: string[] };
  const pedidos = [...new Set((body.userIds ?? []).filter((x) => typeof x === "string"))];

  // Solo personas de la misma organización: sin esto, un id ajeno alcanzaría
  // para darle acceso a las piezas a alguien de afuera.
  const validos = await db.user.findMany({
    where: { id: { in: pedidos }, organizationId: session.organizationId },
    select: { id: true },
  });

  await db.$transaction([
    db.responsableProducto.deleteMany({ where: { productId: producto.id } }),
    db.responsableProducto.createMany({
      data: validos.map((u) => ({ productId: producto.id, userId: u.id })),
    }),
  ]);

  const responsables = await db.responsableProducto.findMany({
    where: { productId: producto.id },
    select: { user: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ responsables: responsables.map((r) => r.user) });
}
