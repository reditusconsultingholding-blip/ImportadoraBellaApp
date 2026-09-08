import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { normalizarNombre } from "@/lib/enlace-shopify";

// Enlazar un producto nuestro con el nombre que usa Shopify.
//
// Es lo que permite calcular rentabilidad sobre lo que la tienda cobró y no
// solo sobre lo que la pauta se atribuye. Cada enlace mueve plata de una
// columna a otra, así que pide el mismo permiso que Rentabilidad.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Enlazar productos es de dirección." }, { status: 403 });
  }

  const body = (await req.json()) as {
    nombre?: string;
    productId?: string;
    automatico?: boolean;
  };

  const nombre = body.nombre?.trim();
  const productId = body.productId?.trim();
  if (!nombre || !productId) {
    return NextResponse.json({ error: "Falta el nombre o el producto." }, { status: 400 });
  }

  // Que el producto sea de esta organización: sin esta comprobación se podría
  // colgar la facturación de una tienda del producto de otra empresa.
  const producto = await db.product.findFirst({
    where: { id: productId, organizationId: session.organizationId },
    select: { id: true },
  });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const nombreNorm = normalizarNombre(nombre);
  if (!nombreNorm) {
    return NextResponse.json({ error: "Ese nombre queda vacío al normalizarlo." }, { status: 400 });
  }

  // upsert y no create: reasignar un nombre a otro producto es una corrección
  // normal —el primer intento se equivocó— y fallar con "ya existe" obligaría a
  // borrar antes de arreglar.
  const enlace = await db.productoShopify.upsert({
    where: {
      organizationId_nombreNorm: { organizationId: session.organizationId, nombreNorm },
    },
    create: {
      organizationId: session.organizationId,
      productId,
      nombre,
      nombreNorm,
      automatico: body.automatico === true,
    },
    update: { productId, nombre, automatico: body.automatico === true },
  });

  return NextResponse.json({ enlace });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Enlazar productos es de dirección." }, { status: 403 });
  }

  const nombre = req.nextUrl.searchParams.get("nombre")?.trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });

  await db.productoShopify.deleteMany({
    where: { organizationId: session.organizationId, nombreNorm: normalizarNombre(nombre) },
  });

  return NextResponse.json({ ok: true });
}
