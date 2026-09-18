import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";

// Traer la economía del mes anterior como punto de partida.
//
// Empieza un mes y la pantalla no tiene ningún número cargado, así que el
// control calcula con la ficha del producto y avisa que es una estimación. La
// alternativa real no es "cargar los 50 productos a mano el día 1": es que
// nadie los cargue y la pantalla quede meses en estimación.
//
// Copiar el mes anterior deja una base razonable en un clic, que después se
// corrige donde cambió. No pisa lo ya cargado: solo escribe los productos que
// todavía no tienen fila en el mes destino, así que apretarlo dos veces no
// deshace una corrección hecha a mano.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json(
      { error: "Cargar la economía de un producto es de dirección con permiso de finanzas." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as { anio?: number; mes?: number };
  const anio = Number(body.anio);
  const mes = Number(body.mes);
  if (!anio || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  const anterior = new Date(Date.UTC(anio, mes - 2, 1));
  const anioAnt = anterior.getUTCFullYear();
  const mesAnt = anterior.getUTCMonth() + 1;

  const [origen, destino] = await Promise.all([
    db.variableProducto.findMany({
      where: { organizationId: session.organizationId, anio: anioAnt, mes: mesAnt },
      select: {
        productId: true,
        efectividad: true,
        produccion: true,
        flete: true,
        precioProm: true,
        cpaMin: true,
        devoluciones: true,
      },
    }),
    db.variableProducto.findMany({
      where: { organizationId: session.organizationId, anio, mes },
      select: { productId: true },
    }),
  ]);

  if (origen.length === 0) {
    return NextResponse.json(
      { error: `El mes ${mesAnt}/${anioAnt} tampoco tiene economía cargada.` },
      { status: 400 },
    );
  }

  const yaEstan = new Set(destino.map((d) => d.productId));
  const faltan = origen.filter((o) => !yaEstan.has(o.productId));

  if (faltan.length > 0) {
    await db.variableProducto.createMany({
      data: faltan.map((f) => ({ organizationId: session.organizationId, anio, mes, ...f })),
    });
  }

  return NextResponse.json({ copiados: faltan.length, desde: `${mesAnt}/${anioAnt}` });
}
