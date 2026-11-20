import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { claveDelMes } from "@/lib/clave-calculadora";

// La economía de un producto en un mes: efectividad, producción, flete,
// precio promedio, CPA máximo y devoluciones.
//
// Escribe una fila por producto y mes. Es lo que la planilla llama VARIABLES,
// y de acá sale toda la utilidad del control publicitario — por eso pide el
// permiso de finanzas y no solo el de dirección.

/** Un número que llega del formulario, o null si vino vacío. */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json(
      { error: "Cargar la economía de un producto es de dirección con permiso de finanzas." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const anio = numero(body.anio);
  const mes = numero(body.mes);
  const productId = typeof body.productId === "string" ? body.productId : null;

  if (!anio || !mes || mes < 1 || mes > 12 || !productId) {
    return NextResponse.json({ error: "Faltan el producto o el mes." }, { status: 400 });
  }

  // El producto tiene que ser de la organización de quien escribe: sin esto,
  // un id de otra cuenta alcanzaría para escribirle los costos.
  const producto = await db.product.findFirst({
    where: { id: productId, organizationId: session.organizationId },
    select: { id: true, name: true },
  });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const datos = {
    efectividad: numero(body.efectividad) ?? 0,
    produccion: numero(body.produccion) ?? 0,
    flete: numero(body.flete) ?? 0,
    precioProm: numero(body.precioProm) ?? 0,
    cpaMin: numero(body.cpaMin),
    devoluciones: numero(body.devoluciones),
  };

  const fila = await db.variableProducto.upsert({
    where: {
      organizationId_productId_anio_mes: {
        organizationId: session.organizationId,
        productId,
        anio,
        mes,
      },
    },
    create: { organizationId: session.organizationId, productId, anio, mes, ...datos },
    update: datos,
  });

  // Si ese mes también se ajustó en la Calculadora («BODY @ 2026-11»), ese
  // ajuste manda en el Control: se actualiza con lo que se acaba de escribir
  // para que gane lo último que alguien cargó, sin importar en qué pantalla.
  const clave = claveDelMes(producto.name, `${anio}-${String(mes).padStart(2, "0")}`);
  const ajuste = await db.calcSetting.findUnique({
    where: { organizationId_producto: { organizationId: session.organizationId, producto: clave } },
    select: { data: true },
  });
  if (ajuste) {
    let previo: Record<string, unknown> = {};
    try {
      previo = JSON.parse(ajuste.data) as Record<string, unknown>;
    } catch {
      previo = {};
    }
    const pct = (v: number | null) => (v == null ? undefined : String(Math.round(v * 1000) / 10));
    const nuevo = {
      ...previo,
      confirmationPct: pct(datos.efectividad) ?? previo.confirmationPct,
      productCost: String(datos.produccion),
      shippingCost: String(datos.flete),
      priceOverride: String(datos.precioProm),
      returnPct: pct(datos.devoluciones) ?? previo.returnPct,
    };
    await db.calcSetting.update({
      where: { organizationId_producto: { organizationId: session.organizationId, producto: clave } },
      data: { data: JSON.stringify(nuevo), updatedById: session.userId },
    });
  }

  return NextResponse.json({ variable: fila });
}
