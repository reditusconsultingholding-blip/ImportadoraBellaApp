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

  // SE GUARDA LA DIFERENCIA, NO SE BORRA TODO Y SE VUELVE A ESCRIBIR.
  //
  // Antes era borrar la lista entera y recrearla. Con un solo pedido funciona;
  // con dos a la vez, no. Y llegaban de a varios: el botón no se bloqueaba
  // mientras guardaba, así que cada clic mandaba otro PUT —el registro de
  // actividad muestra cuatro del mismo producto en tres segundos—. Dos de esos
  // borrados y escrituras pisándose dejan la lista vacía, y el responsable que
  // alguien acababa de poner desaparece.
  //
  // Emilia: "ayer le asigné el tema de responsable y como que se borró, le
  // tuve que poner como tres veces". Dicho así parece que no se guarda; lo que
  // pasaba es que se guardaba y el pedido siguiente lo borraba.
  //
  // Calculando la diferencia, repetir el mismo pedido no cambia nada: quita
  // solo a quien sobra y agrega solo a quien falta.
  const actuales = await db.responsableProducto.findMany({
    where: { productId: producto.id },
    select: { userId: true },
  });
  const quedan = new Set(validos.map((u) => u.id));
  const yaEstan = new Set(actuales.map((r) => r.userId));
  const sacar = [...yaEstan].filter((id) => !quedan.has(id));
  const poner = [...quedan].filter((id) => !yaEstan.has(id));

  await db.$transaction([
    ...(sacar.length > 0
      ? [db.responsableProducto.deleteMany({ where: { productId: producto.id, userId: { in: sacar } } })]
      : []),
    ...(poner.length > 0
      ? [
          db.responsableProducto.createMany({
            data: poner.map((userId) => ({ productId: producto.id, userId })),
            // Si dos pedidos llegan juntos, el segundo no revienta por
            // duplicado: simplemente no tiene nada que agregar.
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  const responsables = await db.responsableProducto.findMany({
    where: { productId: producto.id },
    select: { user: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ responsables: responsables.map((r) => r.user) });
}
